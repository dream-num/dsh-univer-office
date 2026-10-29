import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { expect } from 'vitest'
import { freePort } from './net.ts'
import { importHostBundle, pluginRoot } from './paths.ts'

export type UnitKind = 'sheet' | 'doc' | 'slide' | 'base' | 'board'
export type WorktreeAction = 'ready' | 'reopen' | 'merge' | 'discard'

/**
 * One bundled Gateway owned by a test file, over a temporary workspace with one `.univer` file.
 * Results stay loosely typed: the tests assert the structured results the tools return.
 */
export interface GatewayHarness {
  readonly plugin: any
  readonly service: any
  readonly workspace: string
  readonly file: string
  readonly scoped: { readonly workspace: string; readonly file: string }
  readonly port: number
  readonly origin: string
  /** Base64url key the Gateway uses for this file in `/uf/<key>` routes. */
  readonly fileKey: string
  /** Start another service on the same Gateway port with a config override. */
  createService(config?: Record<string, unknown>): any
  createWorktree(name: string): Promise<string>
  createUnit(worktreeId: string, kind: UnitKind, name: string): Promise<string>
  execute(worktreeId: string | undefined, unitId: string, code: string): Promise<any>
  /** Run a lifecycle action and assert the status the worktree lands in. */
  transition(worktreeId: string, action: WorktreeAction, expected: string): Promise<void>
  dispose(): Promise<void>
}

export async function startGateway(
  options: { config?: Record<string, unknown>; fileName?: string } = {}
): Promise<GatewayHarness> {
  const plugin = await importHostBundle(pluginRoot())
  const workspace = await realpath(await mkdtemp(join(tmpdir(), 'dsh-univer-test-')))
  const file = join(workspace, options.fileName ?? 'test.univer')
  const scoped = { workspace, file }
  const port = await freePort()
  const services: Array<{ dispose(): Promise<void> }> = []
  const createService = (config: Record<string, unknown> = {}) => {
    const service = new plugin.GatewayUniverService(
      new Context(),
      plugin.resolveConfig({ gatewayPort: port, tools: false, ...options.config, ...config })
    )
    services.push(service)
    return service
  }
  const service = createService()
  const harness: GatewayHarness = {
    plugin,
    service,
    workspace,
    file,
    scoped,
    port,
    origin: `http://127.0.0.1:${port}`,
    fileKey: Buffer.from(file).toString('base64url'),
    createService,
    async createWorktree(name) {
      const created = await service.worktree({ ...scoped, action: 'create', name })
      expect(created.result).toMatchObject({ worktreeId: expect.any(String), status: 'draft' })
      return created.result.worktreeId
    },
    async createUnit(worktreeId, kind, name) {
      const created = await service.unit({ ...scoped, action: 'create', worktreeId, kind, name })
      expect(created.result?.unitId, `create ${kind} Unit`).toEqual(expect.any(String))
      return created.result.unitId
    },
    async execute(worktreeId, unitId, code) {
      const executed = await service.executeUnitContent({
        ...scoped,
        ...(worktreeId === undefined ? {} : { worktreeId }),
        unitId,
        code
      })
      return executed.result
    },
    async transition(worktreeId, action, expected) {
      const result = await service.worktree({ ...scoped, action, worktreeId })
      const status = await service.status({ ...scoped, worktreeId })
      expect(result.ok, `${action} result`).toBe(true)
      expect(status.result?.selectedWorktree?.status, `${action} status`).toBe(expected)
    },
    async dispose() {
      for (const owned of services.toReversed()) await owned.dispose()
      await rm(workspace, { recursive: true, force: true })
    }
  }
  try {
    const started = await service.ensureGateway()
    expect(started).toMatchObject({ ok: true, gateway: harness.origin })
    const created = await service.newFile(scoped)
    expect(created.result?.created).toBe(true)
  } catch (error) {
    await harness.dispose()
    throw error
  }
  return harness
}

/** Merge-ready content shared by suites that need one populated trunk. */
export interface PopulatedTrunk {
  readonly sheet: string
  readonly doc: string
  readonly slide: string
  readonly base: string
  readonly board: string
}

/**
 * Create one Unit of every kind in a worktree, give the Sheet and Board content, and merge it,
 * so trunk carries History for every kind.
 */
export async function populateTrunk(harness: GatewayHarness): Promise<PopulatedTrunk> {
  const worktreeId = await harness.createWorktree('populate trunk')
  const sheet = await harness.createUnit(worktreeId, 'sheet', 'Sheet')
  const doc = await harness.createUnit(worktreeId, 'doc', 'Document')
  const slide = await harness.createUnit(worktreeId, 'slide', 'Slide')
  const base = await harness.createUnit(worktreeId, 'base', 'Tasks')
  const board = await harness.createUnit(worktreeId, 'board', 'Planning Board')
  const written = await harness.execute(
    worktreeId,
    sheet,
    'workbook.getActiveSheet().getRange("A1").setValue("trunk"); return "ok";'
  )
  expect(written).toMatchObject({ committed: true, value: 'ok' })
  const shapes = await harness.execute(
    worktreeId,
    board,
    'const shape = board.insertShape({ shapeType: api.Enum.ShapeTypeEnum.RoundRect, transform: { left: 80, top: 80, width: 180, height: 100 } }); if (!shape) throw new Error("Cannot insert Board shape"); shape.getText().setText("Review"); return shape.getId();'
  )
  expect(shapes.committed).toBe(true)
  await harness.transition(worktreeId, 'ready', 'ready')
  await harness.transition(worktreeId, 'merge', 'merged')
  return { sheet, doc, slide, base, board }
}
