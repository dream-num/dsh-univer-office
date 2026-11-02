#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(import.meta.url)
const packageRoot = resolve(dirname(script), '..')
const requireFromPlugin = createRequire(join(packageRoot, 'package.json'))
const runtimePackages = [
  '@univerjs-pro/engine-formula-rust-binding',
  '@univerjs-pro/exchange-node-binding',
  '@univerjs-pro/cli-assets'
]

/** Copy the Gateway's external runtime packages and the platform bindings they resolve. */
export function copyGatewayDependencies(targetRoot) {
  for (const name of runtimePackages) {
    const source = locatePackage(name, requireFromPlugin)
    copyPackage(source, join(targetRoot, 'node_modules', ...name.split('/')))
    const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'))
    const requireFromRuntimePackage = createRequire(join(source, 'package.json'))
    for (const optionalName of Object.keys(manifest.optionalDependencies ?? {})) {
      try {
        const optionalSource = locatePackage(optionalName, requireFromRuntimePackage)
        copyPackage(optionalSource, join(targetRoot, 'node_modules', ...optionalName.split('/')))
      } catch (error) {
        if (error?.code !== 'MODULE_NOT_FOUND') throw error
      }
    }
  }
}

function locatePackage(name, requireFrom) {
  let cursor = dirname(resolvePackageEntry(name, requireFrom))
  for (;;) {
    const manifest = join(cursor, 'package.json')
    if (existsSync(manifest)) {
      const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
      if (parsed.name === name) return cursor
    }
    const parent = dirname(cursor)
    if (parent === cursor) throw new Error(`package root not found for ${name}`)
    cursor = parent
  }
}

function resolvePackageEntry(name, requireFrom) {
  const candidates =
    name === '@univerjs-pro/cli-assets' ? [`${name}/manifest.json`] : [name, `${name}/package.json`]
  let missing
  for (const candidate of candidates) {
    try {
      return requireFrom.resolve(candidate)
    } catch (error) {
      if (error?.code !== 'MODULE_NOT_FOUND' && error?.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED')
        throw error
      missing = error
    }
  }
  throw missing
}

function copyPackage(source, destination) {
  rmSync(destination, { recursive: true, force: true })
  mkdirSync(dirname(destination), { recursive: true })
  cpSync(source, destination, { recursive: true, dereference: true })
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === script) {
  const target = process.argv[2]
  if (target === undefined) throw new Error('usage: copy-gateway-dependencies.mjs <package-root>')
  copyGatewayDependencies(resolve(target))
  console.log('Copied Gateway dependencies')
}
