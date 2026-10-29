// Real DSH Profile settings in a temporary deployment: bundle compatibility, activation, live
// update, persistence across restarts, stale-write rejection, reset, and teardown. Runs only
// against an independently installed DSH 0.1.7+ package named by UNIVER_DSH_RUNTIME_ROOT, and
// never changes that installation's own profile.
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../support/paths.ts'

const runtime = process.env.UNIVER_DSH_RUNTIME_ROOT

describe.skipIf(runtime === undefined)('Host settings in a real DSH Profile', () => {
  let dir: string
  let ctx: any
  let start: () => Promise<any>
  let patchPath: string
  const describeSettings = () => ctx.settings.describe().find((entry: any) => entry.ns === 'univer')
  const restart = async () => {
    await ctx.fiber.dispose()
    ctx = await start()
  }

  beforeAll(async () => {
    const req = createRequire(join(runtime!, 'package.json'))
    const { boot, initProfile, loadProfileDirectory, readProfilePatches } = await import(
      pathToFileURL(req.resolve('@deepseek-ai/dsh-app-boot')).href
    )
    dir = await mkdtemp(join(tmpdir(), 'univer-settings-profile-'))
    await mkdir(join(dir, 'node_modules/dsh-univer-office/lib'), { recursive: true })
    await symlink(
      dirname(dirname(req.resolve('@deepseek-ai/cordis/package.json'))),
      join(dir, 'node_modules/@deepseek-ai')
    )
    await Promise.all(
      ['libsql', 'puppeteer-core', '@puppeteer', '@univerjs-pro'].map((dependency) =>
        symlink(join(REPO_ROOT, 'node_modules', dependency), join(dir, 'node_modules', dependency))
      )
    )
    // Keep the published manifest and bundle patch: stripped peers bypass DSH's compatibility
    // gate and can hide a plugin that is skipped in real profiles.
    await Promise.all(
      ['package.json', 'cordis.patch.yml'].map((file) =>
        copyFile(join(REPO_ROOT, file), join(dir, 'node_modules/dsh-univer-office', file))
      )
    )
    await copyFile(
      join(REPO_ROOT, 'lib/index.js'),
      join(dir, 'node_modules/dsh-univer-office/lib/index.js')
    )
    initProfile(dir, ['dsh-univer-office'])
    const profile = loadProfileDirectory('dsh', dir, join(runtime!, 'package.json'))
    expect(profile.layers, 'the real bundle must pass DSH compatibility checks').toHaveLength(1)
    patchPath = profile.patchPath
    await writeFile(
      patchPath,
      JSON.stringify([
        {
          insert: [
            { id: 'config-editor', name: '@deepseek-ai/dsh-config-editor' },
            { id: 'settings', name: '@deepseek-ai/dsh-settings' }
          ]
        },
        {
          id: 'univer',
          config: { tools: false, skills: false, telemetry: false, autoStartGateway: false }
        }
      ])
    )
    const root = join(dir, 'cordis.yml')
    await writeFile(root, '[]')
    const profileContext = {
      name: 'probe',
      dir,
      patchPath,
      installAnchor: join(runtime!, 'package.json'),
      // Home and Profile must differ: otherwise the same patch is loaded twice.
      home: join(dir, 'home'),
      cwd: dir,
      startedBundles: ['dsh-univer-office'],
      overlays: [],
      telemetryDisabledEnv: '1'
    }
    start = () =>
      boot('dsh', root, readProfilePatches('dsh', profileContext), (c: any) => {
        c.provide('profileContext', profileContext)
      })
    ctx = await start()
  })

  afterAll(async () => {
    try {
      await ctx?.fiber.dispose()
    } finally {
      if (dir !== undefined) await rm(dir, { recursive: true, force: true })
    }
  })

  it('activates the real Univer Provider with default settings', () => {
    expect(ctx.get('univer')).toBeTruthy()
    expect(describeSettings()?.value).toMatchObject({
      autoOpenLivePreview: true,
      conversationReviewCards: true
    })
  })

  it('applies a live update without restarting the plugin fiber', async () => {
    const fiberOf = () =>
      [...ctx.loader.entries()].find((entry: any) => entry.options.id === 'univer').fiber
    const fiber = fiberOf()
    await ctx.settings.update(
      'univer',
      { autoOpenLivePreview: false, conversationReviewCards: false },
      describeSettings().revision
    )
    expect(fiberOf()).toBe(fiber)
    expect(describeSettings().value).toMatchObject({
      autoOpenLivePreview: false,
      conversationReviewCards: false
    })
    expect(await readFile(patchPath, 'utf8')).toMatch(/autoOpenLivePreview: false/)
  })

  it('persists the update across a restart', async () => {
    await restart()
    expect(describeSettings().value).toMatchObject({
      autoOpenLivePreview: false,
      conversationReviewCards: false
    })
  })

  it('rejects a stale write', async () => {
    await expect(
      ctx.settings.update('univer', { autoOpenLivePreview: true }, -1)
    ).rejects.toMatchObject({ code: 'SETTINGS_CONFLICT' })
  })

  it('resets one field to its default and persists the reset', async () => {
    await ctx.settings.mutate(
      'univer',
      [{ op: 'unset', path: ['autoOpenLivePreview'] }],
      describeSettings().revision
    )
    await restart()
    expect(describeSettings().value).toMatchObject({
      autoOpenLivePreview: true,
      conversationReviewCards: false
    })
  })
})
