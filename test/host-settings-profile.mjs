import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile, copyFile, symlink, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
// Run against an independently installed DSH 0.1.7+ package, without changing its profile.
const runtime = process.env.UNIVER_DSH_RUNTIME_ROOT
if (!runtime) throw new Error('Set UNIVER_DSH_RUNTIME_ROOT to the installed DSH package directory')
const repo = fileURLToPath(new URL('../', import.meta.url))
const req = createRequire(join(runtime, 'package.json'))
const { boot, initProfile, loadProfileDirectory, readProfilePatches } = await import(
  pathToFileURL(req.resolve('@deepseek-ai/dsh-app-boot'))
)
const dir = await mkdtemp(join(tmpdir(), 'univer-settings-rc1-'))
let ctx
try {
  await mkdir(join(dir, 'node_modules/dsh-univer-office/lib'), { recursive: true })
  await symlink(
    dirname(dirname(req.resolve('@deepseek-ai/cordis/package.json'))),
    join(dir, 'node_modules/@deepseek-ai')
  )
  await Promise.all(
    ['libsql', 'puppeteer-core', '@puppeteer', '@univerjs-pro'].map((dep) =>
      symlink(join(repo, 'node_modules', dep), join(dir, 'node_modules', dep))
    )
  )
  // Keep the published manifest and bundle patch: stripped peers bypass DSH's
  // compatibility gate and can hide a plugin that is skipped in real profiles.
  await Promise.all(
    ['package.json', 'cordis.patch.yml'].map((file) =>
      copyFile(join(repo, file), join(dir, 'node_modules/dsh-univer-office', file))
    )
  )
  await copyFile(
    join(repo, 'lib/index.js'),
    join(dir, 'node_modules/dsh-univer-office/lib/index.js')
  )
  initProfile(dir, ['dsh-univer-office'])
  const profile = loadProfileDirectory('dsh', dir, join(runtime, 'package.json'))
  assert.equal(profile.layers.length, 1, 'The real bundle must pass DSH compatibility checks')
  const rows = [
    { id: 'config-editor', name: '@deepseek-ai/dsh-config-editor' },
    { id: 'settings', name: '@deepseek-ai/dsh-settings' }
  ]
  await writeFile(
    profile.patchPath,
    JSON.stringify([
      { insert: rows },
      {
        id: 'univer',
        config: { tools: false, skills: false, telemetry: false, autoStartGateway: false }
      }
    ])
  )
  const root = join(dir, 'cordis.yml')
  await writeFile(root, '[]')
  const pc = {
    name: 'probe',
    dir,
    patchPath: profile.patchPath,
    installAnchor: join(runtime, 'package.json'),
    // Home and Profile must differ: otherwise the same patch is loaded twice.
    home: join(dir, 'home'),
    cwd: dir,
    startedBundles: ['dsh-univer-office'],
    overlays: [],
    telemetryDisabledEnv: '1'
  }
  const start = () =>
    boot('dsh', root, readProfilePatches('dsh', pc), (c) => {
      c.provide('profileContext', pc)
    })
  ctx = await start()
  assert.ok(ctx.get('univer'), 'The real Univer Provider must activate')
  const describe = () => ctx.settings.describe().find((x) => x.ns === 'univer')
  assert.equal(describe()?.value.autoOpenLivePreview, true)
  assert.equal(describe()?.value.conversationReviewCards, true)
  const fiber = [...ctx.loader.entries()].find((e) => e.options.id === 'univer').fiber
  await ctx.settings.update(
    'univer',
    { autoOpenLivePreview: false, conversationReviewCards: false },
    describe().revision
  )
  assert.equal([...ctx.loader.entries()].find((e) => e.options.id === 'univer').fiber, fiber)
  assert.equal(describe().value.autoOpenLivePreview, false)
  assert.equal(describe().value.conversationReviewCards, false)
  assert.match(await readFile(profile.patchPath, 'utf8'), /autoOpenLivePreview: false/)
  await ctx.fiber.dispose()
  ctx = await start()
  assert.equal(describe().value.autoOpenLivePreview, false)
  assert.equal(describe().value.conversationReviewCards, false)
  await assert.rejects(ctx.settings.update('univer', { autoOpenLivePreview: true }, -1), {
    code: 'SETTINGS_CONFLICT'
  })
  await ctx.settings.mutate(
    'univer',
    [{ op: 'unset', path: ['autoOpenLivePreview'] }],
    describe().revision
  )
  await ctx.fiber.dispose()
  ctx = await start()
  assert.equal(describe().value.autoOpenLivePreview, true)
  assert.equal(describe().value.conversationReviewCards, false)
  console.log(
    'Host profile settings OK (bundle compatibility, activation, live update, persistence, stale-write rejection, reset, teardown)'
  )
} finally {
  try {
    await ctx?.fiber.dispose()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
