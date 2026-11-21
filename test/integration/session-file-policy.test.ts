import { createServer } from 'node:http'
import { listen, closeServer } from '../support/net.ts'
import { randomUUID } from 'node:crypto'
import {
  copyFile,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile
} from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import {
  mountAgentLoopTestDependencies,
  mountAgentLoopTestHarness
} from '@deepseek-ai/dsh-agent-loop-testkit'
import SandboxPolicy, { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import { SessionId } from '@deepseek-ai/dsh-session'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { startGateway, type GatewayHarness } from '../support/gateway.ts'
import {
  V3_VERSIONS,
  backupsOf,
  versionsOf
} from '../../packages/univerfile-sqlite/test/support/legacy.ts'
import { repoPath } from '../support/paths.ts'

const ctx = new Context()
let gateway: GatewayHarness
let external: string
let loop: Awaited<ReturnType<typeof mountAgentLoopTestHarness>>

beforeAll(async () => {
  // DSH includes OS temporary directories in workspace-write. Use a separate, ungranted root.
  external = await realpath(await mkdtemp(join(homedir(), '.univer-policy-test-')))
  await mountAgentLoopTestDependencies(ctx, { workingDirectory: true })
  loop = await mountAgentLoopTestHarness(ctx)
  await ctx.plugin(SandboxPolicy, { mode: 'workspace-write' })
  gateway = await startGateway({ context: ctx })
})

afterAll(async () => {
  await gateway?.dispose()
  await ctx.fiber.dispose()
  if (external) await rm(external, { recursive: true, force: true })
})

async function caller() {
  const agent = await loop.create(SessionId(randomUUID()), {}, { cwd: gateway.workspace })
  const run = async (name: string, args: Record<string, unknown>) => {
    const batch = await ctx.tools.execute({
      agent,
      signal: new AbortController().signal,
      calls: [
        { type: 'tool-call', id: ToolCallId(randomUUID()), name, arguments: JSON.stringify(args) }
      ]
    })
    return batch.results[0]!.result
  }
  return { run, session: agent.session }
}

it('imports an external Office source and enforces per-session write grants on export (#146)', async () => {
  const { run, session } = await caller()
  const worktreeId = await gateway.createWorktree('external source')
  const source = join(external, 'input.csv')
  const output = join(external, 'export.xlsx')
  await writeFile(source, 'name,value\nexternal,42\n')
  const imported = await run('univer_import', {
    file: gateway.file,
    source,
    worktreeId,
    name: 'Imported'
  })
  expect(imported.isError, JSON.stringify(imported.content)).toBe(false)
  const status = await gateway.service.status({ ...gateway.scoped, worktreeId })
  const unitId = status.result.selectedWorktree.units[0].unitId
  setSandboxMode(session, 'read-only')
  const inspected = await run('univer_inspect', {
    file: gateway.file,
    worktreeId,
    unitId,
    range: 'A1:B2'
  })
  expect(inspected.isError, JSON.stringify(inspected.content)).toBe(false)
  expect(inspected.content[0]).toMatchObject({
    type: 'text',
    text: expect.stringContaining('external')
  })
  setSandboxMode(session, 'workspace-write')
  const args = { file: gateway.file, worktreeId, unitId, output }
  expect(await run('univer_export', args)).toMatchObject({
    isError: true,
    error: { info: { code: 'SESSION_SCOPE_DENIED' } }
  })
  await expect(stat(output)).rejects.toMatchObject({ code: 'ENOENT' })
  // Direct service callers can still designate a separate workspace for their output.
  const legacyOutput = join(external, 'direct-export.xlsx')
  await gateway.service.exportUnitContent({
    ...gateway.scoped,
    worktreeId,
    unitId,
    output: legacyOutput,
    outputWorkspace: external
  })
  expect((await readFile(legacyOutput)).subarray(0, 2).toString()).toBe('PK')
  const revoke = ctx.sandboxPolicy.registerWritableRoot(session, external)
  try {
    expect((await run('univer_export', args)).isError).toBe(false)
    expect((await readFile(output)).subarray(0, 2).toString()).toBe('PK')
    const other = await caller()
    expect(await other.run('univer_export', args)).toMatchObject({
      isError: true,
      error: { info: { code: 'SESSION_SCOPE_DENIED' } }
    })
  } finally {
    revoke()
  }
  expect((await run('univer_export', args)).isError).toBe(true)
  setSandboxMode(session, 'danger-full-access')
  const full = join(external, 'full.univer')
  expect((await run('univer_new', { file: full })).isError).toBe(false)
  expect((await readFile(full)).subarray(0, 15).toString()).toBe('SQLite format 3')
  setSandboxMode(session, 'read-only')
  expect(await run('univer_new', { file: 'denied.univer' })).toMatchObject({
    isError: true,
    error: { info: { code: 'SESSION_SCOPE_DENIED' } }
  })
  await expect(stat(join(gateway.workspace, 'denied.univer'))).rejects.toMatchObject({
    code: 'ENOENT'
  })
})

it('applies the session read scope to local images referenced by an SVG (#146)', async () => {
  const { run } = await caller()
  const worktreeId = await gateway.createWorktree('SVG asset scope')
  const unitId = await gateway.createUnit(worktreeId, 'slide', 'Slide')
  const source = join(gateway.workspace, 'slide.svg')
  const asset = join(external, 'mark.svg')
  await writeFile(
    asset,
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#0055aa"/></svg>'
  )
  const href = relative(gateway.workspace, asset).split(sep).join('/')
  await writeFile(
    source,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><image href="${href}" width="80" height="80"/></svg>`
  )
  const args = { file: gateway.file, source, worktreeId, unitId, page: 1 }
  await expect(
    gateway.service.compileSvg({ ...args, workspace: gateway.workspace })
  ).rejects.toThrow('outside the session workspace')
  const compiled = await run('univer_compile_svg', args)
  expect(compiled.isError, JSON.stringify(compiled.content)).toBe(false)
  expect(compiled.content[0]).toMatchObject({
    type: 'text',
    text: expect.stringContaining('"committed":true')
  })
})

it('upgrades an external legacy file in place during a read-only status query (#146)', async () => {
  const { run, session } = await caller()
  setSandboxMode(session, 'read-only')
  const file = join(external, 'legacy.univer')
  await copyFile(
    repoPath('packages', 'univerfile-sqlite', 'test', 'fixtures', 'v2-univer-cli-0.5.0.univer'),
    file
  )
  const bytes = await readFile(file)
  const result = await run('univer_status', { file })
  expect(result.isError, JSON.stringify(result.content)).toBe(false)
  expect(result.content[0]).toMatchObject({ type: 'text', text: expect.stringContaining(file) })
  expect(versionsOf(file)).toEqual(V3_VERSIONS)
  const backups = await backupsOf(external, 'legacy.univer')
  expect(backups).toHaveLength(1)
  expect(await readFile(join(external, backups[0]!))).toEqual(bytes)
  expect(await run('univer_worktree', { file, action: 'create' })).toMatchObject({
    isError: true,
    error: { info: { code: 'SESSION_SCOPE_DENIED' } }
  })
  expect((await run('univer_status', { file })).content).toEqual(result.content)
  expect(await backupsOf(external, 'legacy.univer')).toEqual(backups)
})

it.skipIf(process.platform === 'win32')(
  'rejects writes through a symlink to an ungranted directory (#146)',
  async () => {
    const { run } = await caller()
    const link = join(gateway.workspace, 'linked')
    await symlink(external, link, 'dir')
    expect(await run('univer_new', { file: join(link, 'denied.univer') })).toMatchObject({
      isError: true,
      error: { info: { code: 'SESSION_SCOPE_DENIED' } }
    })
    await expect(stat(join(external, 'denied.univer'))).rejects.toMatchObject({ code: 'ENOENT' })
  }
)

it('rechecks the named browser session for reads and worktree actions (#146)', async () => {
  const { session } = await caller()
  const router = gateway.plugin.createUniverRouter(
    gateway.service,
    ctx.sessions,
    { requestRejection: () => undefined },
    () => ctx.sandboxPolicy
  )
  const server = createServer(router)
  const origin = `http://127.0.0.1:${await listen(server)}`
  const stateUrl = `${origin}/univer-api/state?${new URLSearchParams({ sessionId: session.id, file: gateway.file })}`
  try {
    const worktreeId = await gateway.createWorktree('browser policy')
    const action = () =>
      fetch(`${origin}/univer-api/worktree-action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'ready',
          file: gateway.file,
          worktreeId,
          sessionId: session.id
        })
      })
    expect(await (await fetch(stateUrl)).json()).toMatchObject({
      viewerUrl: expect.stringContaining(session.id)
    })
    setSandboxMode(session, 'read-only')
    const state = await fetch(stateUrl)
    expect(state.status).toBe(200)
    expect(await state.json()).toMatchObject({ file: gateway.file, viewerUrl: null })
    expect((await action()).status).toBe(403)
    setSandboxMode(session, 'workspace-write')
    expect((await action()).status).toBe(200)
    expect(await (await fetch(stateUrl)).json()).toMatchObject({
      viewerUrl: expect.stringContaining(session.id),
      worktrees: expect.arrayContaining([expect.objectContaining({ worktreeId, status: 'ready' })])
    })
  } finally {
    await closeServer(server)
  }
})
