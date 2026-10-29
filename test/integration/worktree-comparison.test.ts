import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  populateTrunk,
  startGateway,
  type GatewayHarness,
  type PopulatedTrunk
} from '../support/gateway.ts'
import { postJson } from '../support/net.ts'

describe('worktree previews and comparisons', () => {
  let gateway: GatewayHarness
  let trunk: PopulatedTrunk
  let worktreeId: string
  let pinned: { comparisonId: string; rightRevision: number }

  const worktreeBase = () =>
    `${gateway.origin}/uf/${gateway.fileKey}/worktrees/${encodeURIComponent(worktreeId)}`
  const readE5 = async (service = gateway.service) => {
    const inspected = await service.inspectUnitContent({
      ...gateway.scoped,
      unitId: trunk.sheet,
      range: 'E5'
    })
    return inspected.result?.ranges?.[0]?.displayValues?.[0]?.[0]
  }

  beforeAll(async () => {
    gateway = await startGateway()
    trunk = await populateTrunk(gateway)
    worktreeId = await gateway.createWorktree('compare worktree')
  })

  afterAll(async () => {
    await gateway?.dispose()
  })

  it('edits Sheet and Base content in the comparison worktree', async () => {
    const sheetEdit = await gateway.execute(
      worktreeId,
      trunk.sheet,
      'workbook.getActiveSheet().getRange("C3").setValue("worktree diff"); return "compared";'
    )
    expect(sheetEdit).toMatchObject({ committed: true, value: 'compared' })
    const baseEdit = await gateway.execute(
      worktreeId,
      trunk.base,
      'const table = base.getTableById("table-1"); if (!table) throw new Error("missing table"); const records = table.addRecords([{ values: { [table.getPrimaryFieldId()]: "preview record" } }]); return records.length;'
    )
    expect(baseEdit).toMatchObject({ committed: true, value: 1 })
  })

  it('lets a reused trunk runtime observe a newly merged revision', async () => {
    // Warm the trunk Sheet runtime first, so the later read proves reuse pulls new revisions.
    expect(await readE5()).not.toBe('trunk advance')
    const advance = await gateway.createWorktree('trunk advance')
    const edit = await gateway.execute(
      advance,
      trunk.sheet,
      'workbook.getActiveSheet().getRange("E5").setValue("trunk advance"); return "advanced";'
    )
    expect(edit).toMatchObject({ committed: true, value: 'advanced' })
    await gateway.transition(advance, 'ready', 'ready')
    await gateway.transition(advance, 'merge', 'merged')
    expect(await readE5()).toBe('trunk advance')
  })

  it('reads the same trunk through one-shot workers when pooling is disabled', async () => {
    const oneShot = gateway.createService({ unitContentRuntimeMaxEntries: 0 })
    expect(await readE5(oneShot)).toBe('trunk advance')
  })

  it('materializes merge previews over the advanced trunk', async () => {
    await gateway.transition(worktreeId, 'ready', 'ready')
    await expectMaterializedPreview(trunk.sheet, {
      blocks: 'required',
      texts: ['worktree diff', 'trunk advance']
    })
    await expectMaterializedPreview(trunk.base, { blocks: 'required', texts: ['preview record'] })
    await expectMaterializedPreview(trunk.doc, { blocks: 'absent' })
    await gateway.transition(worktreeId, 'reopen', 'draft')
  })

  it('pins a history-fidelity comparison with a semantic cell diff', async () => {
    const comparisons = `${worktreeBase()}/comparisons`
    const session = await postJson(comparisons, { left: { kind: 'trunk' } })
    expect(session).toMatchObject({
      error: { code: 1 },
      comparisonId: expect.any(String),
      left: { kind: 'trunk' },
      right: { worktreeId }
    })
    expect(session.units).toEqual(
      expect.arrayContaining([expect.objectContaining({ unitId: trunk.sheet, presence: 'paired' })])
    )

    const unitEndpoint = `${comparisons}/${encodeURIComponent(session.comparisonId)}/units/${encodeURIComponent(trunk.sheet)}`
    const response = await fetch(unitEndpoint)
    expect(response.ok).toBe(true)
    const comparison = await response.json()
    expect(comparison).toMatchObject({
      error: { code: 1 },
      fidelity: 'history',
      left: { present: true },
      right: { present: true, revision: expect.any(Number) },
      stale: false
    })

    const diffResponse = await fetch(`${unitEndpoint}/diff?entityType=cell&detail=changes&limit=10`)
    expect(diffResponse.ok).toBe(true)
    const diff = await diffResponse.json()
    expect(diff.error?.code).toBe(1)
    expect(diff.context).toMatchObject({
      schemaVersion: 1,
      comparisonId: session.comparisonId,
      fidelity: 'history',
      detail: 'changes',
      diagnostics: { readiness: 'ready' }
    })
    expect(diff.context.summary.total).toBeGreaterThanOrEqual(1)
    expect(diff.context.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ entityType: 'cell' })])
    )
    pinned = { comparisonId: session.comparisonId, rightRevision: comparison.right.revision }
  })

  it('marks a pinned comparison stale after the worktree advances', async () => {
    const later = await gateway.execute(
      worktreeId,
      trunk.sheet,
      'workbook.getActiveSheet().getRange("D4").setValue("after pin"); return "advanced";'
    )
    expect(later).toMatchObject({ committed: true, value: 'advanced' })
    const response = await fetch(
      `${worktreeBase()}/comparisons/${encodeURIComponent(pinned.comparisonId)}/units/${encodeURIComponent(trunk.sheet)}`
    )
    expect(response.ok).toBe(true)
    expect(await response.json()).toMatchObject({
      error: { code: 1 },
      stale: true,
      right: { revision: pinned.rightRevision }
    })
  })

  it('discards the worktree', async () => {
    const discarded = await gateway.service.worktreeAction({
      ...gateway.scoped,
      action: 'discard',
      worktreeId
    })
    expect(discarded.ok).toBe(true)
    expect(discarded.state.worktrees).toEqual(
      expect.arrayContaining([expect.objectContaining({ worktreeId, status: 'discarded' })])
    )
  })

  async function expectMaterializedPreview(
    unitId: string,
    expectation: { blocks: 'required' | 'absent'; texts?: readonly string[] }
  ): Promise<void> {
    const response = await fetch(`${worktreeBase()}/preview/units/${encodeURIComponent(unitId)}`)
    const preview = await response.json()
    expect(preview.error?.code).toBe(1)
    expect(preview.snapshot?.unitID).toBe(unitId)
    expect(preview).not.toHaveProperty('changesets')
    // Every Sheet block the snapshot references must be returned with it.
    const returned = new Set(
      Array.isArray(preview.sheetBlocks) ? preview.sheetBlocks.map((block: any) => block?.id) : []
    )
    expect(referencedSheetBlockIds(preview.snapshot).filter((id) => !returned.has(id))).toEqual([])
    if (expectation.blocks === 'required') expect(preview.sheetBlocks?.length).toBeGreaterThan(0)
    else expect(preview.sheetBlocks).toBeUndefined()
    const rendered = JSON.stringify({ snapshot: preview.snapshot, blocks: preview.sheetBlocks })
    for (const text of expectation.texts ?? []) expect(rendered).toContain(text)
  }
})

function referencedSheetBlockIds(snapshot: any): string[] {
  const blockMeta = snapshot?.workbook?.blockMeta
  if (blockMeta === null || typeof blockMeta !== 'object') return []
  return Object.values(blockMeta).flatMap((meta: any) =>
    Array.isArray(meta?.blocks) ? meta.blocks : []
  )
}
