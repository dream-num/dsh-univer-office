import { stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startGateway, type GatewayHarness } from '../support/gateway.ts'
import { postJson } from '../support/net.ts'

const SLIDE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540"><rect width="960" height="540" fill="#f7f8fb"/><text x="80" y="160" font-family="Arial" font-size="54" fill="#182230">Bundled SVG</text></svg>'

describe('Unit content through the bundled Gateway and Workers', () => {
  let gateway: GatewayHarness
  let worktreeId: string
  let sheet: string
  let doc: string
  let slide: string
  let base: string
  let board: string
  let boardElementIds: string[]
  let imported: string

  beforeAll(async () => {
    gateway = await startGateway()
    worktreeId = await gateway.createWorktree('unit content')
    sheet = await gateway.createUnit(worktreeId, 'sheet', 'Smoke')
  })

  afterAll(async () => {
    await gateway?.dispose()
  })

  it('projects same-origin Viewer targets for the file and its worktree', async () => {
    const projected = await gateway.service.fileState(gateway.scoped)
    const viewerFileKey = encodeURIComponent(Buffer.from(gateway.file).toString('base64url'))
    expect(projected.gateway).toBe(gateway.origin)
    expect(projected.viewerUrl).toBe(`/univer-viewer/?file=${viewerFileKey}`)
    const worktree = projected.worktrees.find(
      (entry: { worktreeId: string }) => entry.worktreeId === worktreeId
    )
    expect(worktree?.openUrl).toBe(
      `/univer-viewer/?file=${viewerFileKey}&worktree=${encodeURIComponent(worktreeId)}`
    )
    expect(worktree?.worktreeUrl).toMatch(/^\/univer-viewer\/\?/)
  })

  it('creates and removes a Unit in a draft worktree', async () => {
    const temporary = await gateway.createUnit(worktreeId, 'doc', 'Temporary')
    const removed = await gateway.service.unit({
      ...gateway.scoped,
      action: 'remove',
      worktreeId,
      unitId: temporary
    })
    expect(removed.result?.removed).toBe(true)
    doc = await gateway.createUnit(worktreeId, 'doc', 'History Document')
    slide = await gateway.createUnit(worktreeId, 'slide', 'Rendered')
    base = await gateway.createUnit(worktreeId, 'base', 'Tasks')
    board = await gateway.createUnit(worktreeId, 'board', 'Planning Board')
  })

  it('rejects reversible Unit removal through the Gateway API without changing state', async () => {
    const before = await gateway.service.status({ ...gateway.scoped, worktreeId })
    const responses = await Promise.all(
      [true, false].map(async (removed) => {
        const response = await fetch(
          `${gateway.origin}/uf/${gateway.fileKey}/universer-api/worktrees/${encodeURIComponent(worktreeId)}/units/${encodeURIComponent(sheet)}/removal`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ removed })
          }
        )
        return { status: response.status, body: await response.json() }
      })
    )
    for (const response of responses) {
      expect(response).toEqual({
        status: 400,
        body: expect.objectContaining({
          error: expect.objectContaining({
            code: 'INVALID_REQUEST',
            message: 'Reversible Worktree Unit removal is not supported by Univerfile'
          })
        })
      })
    }
    const after = await gateway.service.status({ ...gateway.scoped, worktreeId })
    expect(after.result).toEqual(before.result)
  })

  it('compiles SVG onto a Slide page and lints its layout', async () => {
    const source = join(gateway.workspace, 'slide.svg')
    await writeFile(source, SLIDE_SVG)
    const compiled = await gateway.service.compileSvg({
      ...gateway.scoped,
      source,
      sourceWorkspace: gateway.workspace,
      worktreeId,
      unitId: slide,
      page: 1
    })
    expect(compiled.operation).toBe('compile-svg')
    expect(compiled.result?.execution?.committed).toBe(true)

    const layout = await gateway.service.lintUnitLayout({
      ...gateway.scoped,
      worktreeId,
      unitId: slide
    })
    expect(layout.operation).toBe('lint')
    expect(layout.result).toMatchObject({ kind: 'unit-layout-lint', findings: expect.any(Array) })
    expect(layout.result.coverage.pages).toHaveLength(1)
  })

  it('executes Facade code, including concurrent writers on one Unit', async () => {
    const executed = await gateway.execute(
      worktreeId,
      sheet,
      'workbook.getActiveSheet().getRange("A1").setValue("bundled"); return "ok";'
    )
    expect(executed).toMatchObject({ committed: true, value: 'ok' })

    const [left, right] = await Promise.all([
      gateway.execute(
        worktreeId,
        sheet,
        'workbook.getActiveSheet().getRange("A2").setValue("left"); return "left";'
      ),
      gateway.execute(
        worktreeId,
        sheet,
        'workbook.getActiveSheet().getRange("B2").setValue("right"); return "right";'
      )
    ])
    expect(left).toMatchObject({ committed: true, value: 'left' })
    expect(right).toMatchObject({ committed: true, value: 'right' })
  })

  it('does not hand a failed write from a pooled runtime to the next operation', async () => {
    await expect(
      gateway.execute(
        worktreeId,
        sheet,
        'workbook.getActiveSheet().getRange("C1").setValue("partial"); throw new Error("stop after write");'
      )
    ).rejects.toThrow('stop after write')
    const after = await gateway.execute(
      worktreeId,
      sheet,
      'return workbook.getActiveSheet().getRange("C1").getValue();'
    )
    expect(after.committed).toBe(false)
    expect(after.value).not.toBe('partial')
  })

  it('writes Board shapes', async () => {
    const result = await gateway.execute(
      worktreeId,
      board,
      'const review = board.insertShape({ shapeType: api.Enum.ShapeTypeEnum.RoundRect, transform: { left: 80, top: 80, width: 180, height: 100 } }); const approve = board.insertShape({ shapeType: api.Enum.ShapeTypeEnum.RoundRect, transform: { left: 320, top: 80, width: 180, height: 100 } }); if (!review || !approve) throw new Error("Cannot insert Board shapes"); review.getText().setText("Review"); approve.getText().setText("Approve"); return [review.getId(), approve.getId()];'
    )
    expect(result.committed).toBe(true)
    expect(result.value).toEqual([expect.any(String), expect.any(String)])
    boardElementIds = result.value
  })

  it('imports a CSV file as a Sheet Unit', async () => {
    const source = join(gateway.workspace, 'import.csv')
    await writeFile(source, 'name,value\nalpha,1\nbeta,2\n')
    const result = await gateway.service.importUnitContent({
      ...gateway.scoped,
      source,
      sourceWorkspace: gateway.workspace,
      worktreeId,
      name: 'Imported'
    })
    expect(result.result).toMatchObject({ unitId: expect.any(String), kind: 'sheet' })
    imported = result.result.unitId
  })

  it('lists every Unit of the selected worktree', async () => {
    const selected = await gateway.service.status({ ...gateway.scoped, worktreeId })
    expect(selected.result?.selectedWorktree?.units).toHaveLength(6)
  })

  it('inspects Sheet ranges, including imported content', async () => {
    const inspected = await gateway.service.inspectUnitContent({
      ...gateway.scoped,
      worktreeId,
      unitId: sheet,
      range: 'A1:B2'
    })
    const values = inspected.result?.ranges?.[0]?.displayValues
    expect(values?.[0]?.[0]).toBe('bundled')
    expect(values?.[1]?.slice(0, 2)).toEqual(['left', 'right'])

    const importedRange = await gateway.service.inspectUnitContent({
      ...gateway.scoped,
      worktreeId,
      unitId: imported,
      range: 'A1:B3'
    })
    expect(importedRange.result?.ranges?.[0]?.displayValues?.[1]?.[0]).toBe('alpha')
  })

  it('inspects Base and Board overviews and Board elements', async () => {
    const baseOverview = await gateway.service.inspectUnitContent({
      ...gateway.scoped,
      worktreeId,
      unitId: base
    })
    expect(baseOverview.result?.kind).toBe('base')
    expect(baseOverview.result?.tables?.[0]?.name).toBe('Table 1')
    expect(baseOverview.result?.tables?.[0]?.fields?.[0]?.name).toBe('Name')

    const boardOverview = await gateway.service.inspectUnitContent({
      ...gateway.scoped,
      worktreeId,
      unitId: board
    })
    expect(boardOverview.result?.kind).toBe('board')
    expect(boardOverview.result?.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: boardElementIds[0], text: 'Review' }),
        expect.objectContaining({ id: boardElementIds[1], text: 'Approve' })
      ])
    )

    const elements = await gateway.service.inspectUnitContent({
      ...gateway.scoped,
      worktreeId,
      unitId: board,
      elementIds: boardElementIds
    })
    expect(elements.result?.kind).toBe('board-element')
    expect(elements.result?.elements).toEqual(
      boardElementIds.map((id) => expect.objectContaining({ id, type: 'shape' }))
    )
  })

  it('finds and shows Facade API reference entries per Unit kind', async () => {
    const cases = [
      ['setValue', 'sheet', 'FRange.setValue'],
      ['insertImage', 'board', 'FBoard.insertImage'],
      ['getSchema', 'base', 'FBase.getSchema']
    ] as const
    for (const [query, unit, label] of cases) {
      const found = await gateway.service.apiReference({
        action: 'find',
        queries: [query],
        unit,
        limit: 3
      })
      expect(found.result?.[0]?.matches?.[0]?.label).toBe(label)
    }
    const shown = await gateway.service.apiReference({
      action: 'show',
      queries: ['FRange.setValue']
    })
    expect(shown.result?.[0]?.status).toBe('found')
  })

  it('finds, reads, and exports bundled resources', async () => {
    const registries = await gateway.service.resources({ action: 'registries' })
    expect(registries.result?.registries?.length).toBeGreaterThan(0)
    const found = await gateway.service.resources({
      action: 'find',
      queries: ['plausible'],
      limit: 1
    })
    const handle = found.result?.resources?.[0]?.handle
    expect(handle).toEqual(expect.any(String))

    // Resource reads fetch remote SVG; serve a deterministic body instead of the network.
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.startsWith('https://')) {
        return new Response(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>',
          { status: 200, headers: { 'content-type': 'image/svg+xml; charset=utf-8' } }
        )
      }
      return originalFetch(input, init)
    }
    try {
      const read = await gateway.service.resources({ action: 'read', handle })
      expect(read.result?.svg).toContain('<svg')
      const exported = await gateway.service.resources({
        action: 'export',
        handles: [handle],
        output: join(gateway.workspace, 'resources'),
        outputWorkspace: gateway.workspace
      })
      const path = exported.result?.exported?.[0]?.path
      expect(path).toEqual(expect.any(String))
      expect((await stat(path)).size).toBeGreaterThan(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('exports a Sheet Unit to xlsx', async () => {
    const output = join(gateway.workspace, 'smoke.xlsx')
    await gateway.service.exportUnitContent({
      ...gateway.scoped,
      worktreeId,
      unitId: sheet,
      output,
      outputWorkspace: gateway.workspace
    })
    expect((await stat(output)).size).toBeGreaterThan(0)
  })

  it('moves the worktree through ready, reopen, and merge', async () => {
    await gateway.transition(worktreeId, 'ready', 'ready')
    await gateway.transition(worktreeId, 'reopen', 'draft')
    await gateway.transition(worktreeId, 'ready', 'ready')
    await gateway.transition(worktreeId, 'merge', 'merged')
    const merged = await gateway.service.status(gateway.scoped)
    expect(merged.result?.trunk?.units).toHaveLength(6)
  })

  it('allows Board History actions through direct and batch authz', async () => {
    const exchangeBase = `${gateway.origin}/uf/${gateway.fileKey}/universer-api`
    const actions = [44, 43]
    const allowed = actions.map((action) => ({ action, allowed: true }))
    const direct = await postJson(
      `${exchangeBase}/authz/7/object/${encodeURIComponent(board)}/allowed`,
      { unitID: board, objectID: board, objectType: 7, actions }
    )
    expect(direct.actions).toEqual(allowed)
    const batch = await postJson(`${exchangeBase}/authz/-/object/-/batch_allowed`, {
      requests: [{ unitID: board, objectID: board, objectType: 7, actions }]
    })
    expect(batch.objectActions).toEqual([{ unitID: board, objectID: board, actions: allowed }])
  })

  it('indexes trunk History with readable changesets for every Unit kind', async () => {
    const exchangeBase = `${gateway.origin}/uf/${gateway.fileKey}/universer-api`
    for (const [kind, unitId] of [
      ['Sheet', sheet],
      ['Doc', doc],
      ['Slide', slide],
      ['Base', base],
      ['Board', board]
    ] as const) {
      const history = await waitForHistory(exchangeBase, unitId)
      const historyId = history.historyIds?.[0]
      expect(history.error?.code, kind).toBe(1)
      expect(historyId, kind).toEqual(expect.any(String))
      const entry = history.entities?.datas?.[historyId]
      expect(entry?.unitId, kind).toBe(unitId)
      const response = await fetch(
        `${exchangeBase}/history/${encodeURIComponent(unitId)}/cs?startRevision=${entry.startRevision}&endRevision=${entry.endRevision}`
      )
      expect(response.ok, kind).toBe(true)
      const changesets = await response.json()
      expect(changesets.error?.code, kind).toBe(1)
      expect(changesets.changesets, kind).toEqual(expect.any(Array))
    }
  })
})

async function waitForHistory(exchangeBase: string, unitId: string): Promise<any> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(
      `${exchangeBase}/history/${encodeURIComponent(unitId)}/list?length=20`
    )
    if (!response.ok) throw new Error(`History request failed: ${await response.text()}`)
    const history = await response.json()
    if (Array.isArray(history.historyIds) && history.historyIds.length > 0) return history
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`History for ${unitId} was not indexed`)
}
