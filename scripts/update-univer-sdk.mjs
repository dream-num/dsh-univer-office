#!/usr/bin/env node

// Re-pin the Univer SDK cohort to one exact version across every manifest in
// this repository, then drop any SDK entries from the pnpm-workspace.yaml
// overrides block.
//
//   pnpm update:univer-sdk --sdk_version 1.0.0-rc.0
//
// Cohort policy (see docs/architecture.md):
//   - SDK dependencies (@univerjs/, @univerjs-pro/, @univer-cli/) are pinned to
//     one exact version everywhere; they upgrade as a single compatible family.
//   - Self-versioned packages follow their own release cadence and are left
//     untouched, though their declarations must stay exact versions.
//   - Transitive binding packages are never re-pinned here: their versions must
//     mirror the declaration in the SDK wrapper that pulls them in.
//   - SDK overrides exist only while tracking a dev build; after an insiders,
//     alpha, beta, rc, or latest upgrade the overrides must be empty.
//
// The script only edits manifests; run `pnpm install` afterwards to refresh
// the lockfile and node_modules.

import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(import.meta.url)
const packageRoot = join(dirname(script), '..')

const sdkPrefixes = ['@univerjs/', '@univerjs-pro/', '@univer-cli/']

// Versioned on their own release cadence, never re-pinned to the SDK baseline.
const selfVersioned = new Set([
  '@univerjs/icons',
  '@univerjs-pro/cli-assets',
  '@univerjs-pro/doc-typst-native-binding'
])

// Pulled in through the SDK dependency tree; their version mirrors the wrapper
// declaration, so cohort unification must not touch them.
const transitiveBindings = new Set([
  '@univerjs-pro/engine-formula-rust-binding',
  '@univerjs-pro/exchange-node-binding'
])

const dependencySections = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies'
]

const exactVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

function parseSdkVersion() {
  const flagIndex = process.argv.indexOf('--sdk_version')
  const value = flagIndex >= 0 ? process.argv[flagIndex + 1] : undefined
  if (value === undefined || !exactVersionPattern.test(value)) {
    throw new Error(
      `usage: update-univer-sdk.mjs --sdk_version <exact-semver> (got ${value ?? 'none'})`
    )
  }
  return value
}

function isSdkDependency(name) {
  if (!sdkPrefixes.some((prefix) => name.startsWith(prefix))) return false
  if (selfVersioned.has(name) || transitiveBindings.has(name)) return false
  return true
}

async function collectManifests() {
  const manifests = [join(packageRoot, 'package.json')]
  const packages = await readdir(join(packageRoot, 'packages'), { withFileTypes: true })
  for (const entry of packages) {
    if (!entry.isDirectory()) continue
    const manifest = join(packageRoot, 'packages', entry.name, 'package.json')
    try {
      JSON.parse(await readFile(manifest, 'utf8'))
    } catch {
      continue
    }
    manifests.push(manifest)
  }
  return manifests
}

async function rePinManifest(manifestPath, sdkVersion) {
  const source = await readFile(manifestPath, 'utf8')
  const manifest = JSON.parse(source)
  let changed = 0
  for (const section of dependencySections) {
    const entries = manifest[section]
    if (entries === null || typeof entries !== 'object' || Array.isArray(entries)) continue
    for (const [name, specifier] of Object.entries(entries)) {
      if (isSdkDependency(name) && specifier !== sdkVersion) {
        entries[name] = sdkVersion
        changed++
      }
    }
  }
  if (changed > 0) {
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  }
  return { manifestPath, changed }
}

// Line-based edit: pnpm-workspace.yaml has no SDK overrides today, and the
// overrides block is flat `  'name': version` entries — no nested structures
// to preserve. Everything outside the block is copied through verbatim.
async function removeSdkOverrides() {
  const workspacePath = join(packageRoot, 'pnpm-workspace.yaml')
  const source = await readFile(workspacePath, 'utf8')
  const lines = source.split('\n')
  const kept = []
  const removed = []
  let insideOverrides = false
  let overrideEntries = 0
  for (const line of lines) {
    if (/^overrides:\s*(?:#.*)?$/.test(line)) {
      insideOverrides = true
      overrideEntries = 0
      continue
    }
    if (insideOverrides) {
      if (/^\s*(?:#.*)?$/.test(line)) continue
      const entry = /^ {2}(?:'([^']+)'|"([^"]+)"|([^'":\s][^:]*)):/.exec(line)
      if (entry !== null) {
        const name = entry[1] ?? entry[2] ?? entry[3]
        if (sdkPrefixes.some((prefix) => name.startsWith(prefix))) {
          removed.push(name)
          continue
        }
        overrideEntries++
        kept.push(line)
        continue
      }
      if (overrideEntries === 0) continue
      insideOverrides = false
    }
    kept.push(line)
  }
  if (removed.length > 0) {
    await writeFile(workspacePath, `${kept.join('\n')}`)
  }
  return removed
}

const sdkVersion = parseSdkVersion()
let pinned = 0
for (const manifestPath of await collectManifests()) {
  const { changed } = await rePinManifest(manifestPath, sdkVersion)
  pinned += changed
  console.log(
    `${manifestPath}: ${changed} SDK ${changed === 1 ? 'entry' : 'entries'} → ${sdkVersion}`
  )
}
const removedOverrides = await removeSdkOverrides()
for (const name of removedOverrides) {
  console.log(`pnpm-workspace.yaml: removed SDK override ${name}`)
}
if (pinned === 0 && removedOverrides.length === 0) {
  console.log(`SDK cohort already pinned to ${sdkVersion}; nothing to change.`)
}
console.log('Next: pnpm install, then build and run the affected smoke tests.')
