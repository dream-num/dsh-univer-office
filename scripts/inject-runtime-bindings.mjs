#!/usr/bin/env node

// Generate the published manifest's native binding dependencies.
//
// The transitive bindings (@univerjs-pro/engine-formula-rust-binding,
// @univerjs-pro/exchange-node-binding) never appear in this repository's
// manifests — the wrappers that pull them in own their versions, and the
// bundles inline the wrapper code so only the binaries stay external. The
// published manifest must still install the binaries as direct dependencies:
// dsh consumers install with pnpm, whose isolated layout does not expose
// transitive dependencies to the plugin's own bundles. At packaging time this
// script reads the resolved binding versions from the installed tree (never a
// hand-pinned number), cross-checks them against every wrapper declaration in
// the pnpm store, and writes them into the dist manifest.

import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(import.meta.url)
const packageRoot = resolve(dirname(script), '..')
const requireFromPlugin = createRequire(join(packageRoot, 'package.json'))

const transitiveBindings = [
  '@univerjs-pro/engine-formula-rust-binding',
  '@univerjs-pro/exchange-node-binding'
]

const exactVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

// Wrappers declare their binding either exactly or, since the 1.3 SDK, as a tilde range
// (`~1.0.4`). The published manifest always pins the resolved exact version.
function satisfiesDeclaration(version, declaration) {
  if (exactVersionPattern.test(declaration)) return version === declaration
  const tilde = /^~(\d+)\.(\d+)\.(\d+)$/.exec(declaration)
  if (tilde === null) throw new Error(`unsupported binding declaration ${declaration}`)
  const installed = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (installed === null) return false
  return (
    installed[1] === tilde[1] &&
    installed[2] === tilde[2] &&
    Number(installed[3]) >= Number(tilde[3])
  )
}

function manifestRootOf(name) {
  let cursor = dirname(requireFromPlugin.resolve(name))
  for (;;) {
    try {
      return JSON.parse(readFileSync(join(cursor, 'package.json'), 'utf8'))
    } catch {
      // No readable manifest at this level; keep walking up.
    }
    const parent = dirname(cursor)
    if (parent === cursor) {
      throw new Error(`package manifest not found for ${name}`)
    }
    cursor = parent
  }
}

// Every package in the pnpm store whose dependency tree links the binding must
// make the same declaration, and the version the resolver picked must satisfy it —
// otherwise the installed tree does not match the wrapper declarations.
function storeDeclaredVersions(binding, installedRoot) {
  const store = join(packageRoot, 'node_modules', '.pnpm')
  if (!existsSync(store)) return null
  const bindingName = binding.split('/')[1]
  const declared = new Set()
  for (const entry of readdirSync(store)) {
    const scopeDir = join(store, entry, 'node_modules', '@univerjs-pro')
    let candidates
    try {
      candidates = readdirSync(scopeDir)
    } catch {
      continue
    }
    for (const candidate of candidates) {
      const manifestPath = join(scopeDir, candidate, 'package.json')
      let manifest
      try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      } catch {
        continue
      }
      if (typeof manifest.dependencies?.[binding] !== 'string') continue
      try {
        if (realpathSync(join(scopeDir, bindingName)) !== installedRoot) continue
      } catch {
        continue
      }
      declared.add(manifest.dependencies[binding])
    }
  }
  return declared
}

function injectRuntimeBindings(manifestPath) {
  const published = JSON.parse(readFileSync(manifestPath, 'utf8'))
  published.dependencies = published.dependencies ?? {}
  for (const binding of transitiveBindings) {
    const installed = manifestRootOf(binding)
    if (installed.name !== binding) {
      throw new Error(`resolved ${binding} to a package named ${installed.name}`)
    }
    if (typeof installed.version !== 'string' || !exactVersionPattern.test(installed.version)) {
      throw new Error(`${binding} is installed at a non-exact version: ${installed.version}`)
    }
    const declared = storeDeclaredVersions(
      binding,
      realpathSync(dirname(requireFromPlugin.resolve(binding)))
    )
    if (
      declared !== null &&
      (declared.size !== 1 || !satisfiesDeclaration(installed.version, [...declared][0]))
    ) {
      throw new Error(
        `installed ${binding}@${installed.version} does not match the wrapper declarations ${[...declared].join(', ')}; rerun pnpm install`
      )
    }
    published.dependencies[binding] = installed.version
    console.log(`${binding}@${installed.version} (resolved; wrapper declarations agree)`)
  }
  writeFileSync(manifestPath, `${JSON.stringify(published, null, 2)}\n`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === script) {
  const target = process.argv[2]
  if (target === undefined) {
    throw new Error('usage: inject-runtime-bindings.mjs <dist-manifest>')
  }
  injectRuntimeBindings(resolve(target))
}
