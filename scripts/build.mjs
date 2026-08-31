// Build the plugin application from source over the Univer SDK — the single
// build mode (pnpm). The Viewer source lives in this repository alongside the
// host, worker, and Gateway sources; SDK packages come from the registry.
//
//   pnpm run build:lib     → lib/index.js (host) + lib/client.js (client bundle)
//   pnpm run build:worker  → artifacts/unit-content-worker.mjs
//   pnpm run build:gateway → artifacts/gateway.cjs
//   pnpm run build:render  → artifacts/render-machine/
//   pnpm run build:viewer  → artifacts/viewer/
//   pnpm run build         → all five applications
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { builtinModules, createRequire } from 'node:module'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { build } from 'esbuild'
import { build as buildVite } from 'vite'
import { createEmbedUiMenuSchemaAliases, createPrismComponentEsmPlugin } from './viewer-vite.mjs'

const target = process.argv[2] ?? 'all'
const require = createRequire(import.meta.url)

// Inline-bundle packaging, following the univer-cli model:
//   - everything JS is inlined (packages: 'bundle')
//   - node builtins stay external
//   - the DSH host peer dependencies stay external (the Harness runtime provides them)
//   - the large/binary packages stay external and are declared as runtime
//     dependencies, resolved per-platform from the registry at install time
const external = [
  ...builtinModules.map((id) => `node:${id}`),
  ...builtinModules,
  // DSH host peers (provided by the Harness runtime, not shipped in the tarball)
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-host-webserver',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-skill',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/schemastery',
  // Large / binary packages: never inlined, declared as runtime dependencies
  'libsql',
  '@univerjs-pro/exchange-node-binding',
  '@univerjs-pro/engine-formula-rust-binding',
  '@univerjs-pro/cli-assets',
  '@puppeteer/browsers',
  'puppeteer-core',
]

if (target === 'all' || target === 'lib') {
  await rm('lib', { recursive: true, force: true })
  await mkdir('lib', { recursive: true })

  await build({
    entryPoints: ['src/host/index.ts'],
    outfile: 'lib/index.js',
    bundle: true,
    packages: 'bundle',
    external,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    sourcemap: false,
    legalComments: 'none',
  })

  // Browser half: react stays external (the DSH client runtime provides it);
  // everything else is inlined into the single client bundle.
  const client = await build({
    entryPoints: ['src/client/index.tsx'],
    bundle: true,
    write: false,
    packages: 'bundle',
    external: ['react'],
    platform: 'browser',
    target: 'es2022',
    format: 'cjs',
    legalComments: 'none',
  })
  const clientCode = client.outputFiles[0]?.text
  if (clientCode === undefined) throw new Error('client build produced no JavaScript')
  await writeFile('lib/client.js', `window.__ModuleLoader__.load({\n  id: "dsh-univer-office",\n  factory: (require) => {\n    var module = { exports: {} };\n    var exports = module.exports;\n${indent(clientCode, 4)}\n    return module.exports;\n  }\n});\n`)

  // Product telemetry entry for package lifecycle hooks (postinstall/uninstall).
  await build({
    entryPoints: ['src/host/telemetry/entry.ts'],
    outfile: 'lib/telemetry-entry.js',
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    legalComments: 'none',
    sourcemap: false,
  })

  // Telemetry endpoint: only the release workflow pins the live proxy address
  // (RELEASE_TELEMETRY_ENDPOINT); local builds stay fully inert because an
  // empty endpoint disables every send, including the lifecycle hooks.
  const telemetryEndpoint = process.env.RELEASE_TELEMETRY_ENDPOINT ?? ''
  const manifest = JSON.parse(await readFile('package.json', 'utf8'))
  let commit = ''
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    // Building outside a git checkout: telemetry payloads simply omit the commit.
  }
  await writeFile(
    'lib/build-info.json',
    `${JSON.stringify({ commit, telemetryEndpoint, version: manifest.version }, null, 2)}\n`
  )
  console.log('built lib/index.js + lib/client.js + lib/telemetry-entry.js')
}

if (target === 'all' || target === 'worker') {
  // Unit-content worker: a standalone process built from src/workers/unit-content
  // with the SDK dependencies inlined (except the platform binary packages, which
  // are resolved at runtime from the plugin's node_modules).
  const workerOut = 'artifacts/unit-content-worker.mjs'
  const workerExternal = [
    ...builtinModules.map((id) => `node:${id}`),
    ...builtinModules,
    '@univerjs-pro/cli-assets',
    '@univerjs-pro/engine-formula-rust-binding',
    '@univerjs-pro/exchange-node-binding',
    'libsql',
  ]
  await build({
    entryPoints: ['src/workers/unit-content/entry.ts'],
    outfile: workerOut,
    bundle: true,
    packages: 'bundle',
    external: workerExternal,
    platform: 'node',
    target: 'node22.19',
    format: 'esm',
    legalComments: 'none',
    sourcemap: false,
  })
  console.log('built', workerOut)
}

if (target === 'all' || target === 'gateway') {
  // Collaboration Gateway: a standalone server built from the plugin-owned
  // gateway application sources (src/gateway-app) over the collaboration SDK.
  const gatewayOut = 'artifacts/gateway.cjs'
  const gatewayExternal = [
    ...builtinModules.map((id) => `node:${id}`),
    ...builtinModules,
    'libsql',
    '@univerjs-pro/exchange-node-binding',
    '@univerjs-pro/engine-formula-rust-binding',
    '@univerjs-pro/cli-assets',
  ]
  await build({
    entryPoints: ['src/gateway-app/gateway-entry.ts'],
    outfile: gatewayOut,
    bundle: true,
    packages: 'bundle',
    // The ESM entry creates a require function from import.meta.url, which is
    // not defined in the Gateway's CJS output. Bundle the package's equivalent
    // CJS entry so its native binding continues to resolve from __filename.
    alias: { '@univerjs-pro/exchange-node': require.resolve('@univerjs-pro/exchange-node') },
    external: gatewayExternal,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    legalComments: 'none',
    sourcemap: false,
  })
  console.log('built', gatewayOut)
}

if (target === 'all' || target === 'render') {
  const renderRoot = resolve('src/render-machine')
  const renderOut = resolve('artifacts/render-machine')
  await buildVite({
    configFile: false,
    root: renderRoot,
    base: './',
    build: {
      target: 'esnext',
      outDir: renderOut,
      emptyOutDir: true,
      chunkSizeWarningLimit: 20_000,
    },
    define: {
      'process.env': '{}',
    },
    resolve: {
      alias: {
        ...createEmbedUiMenuSchemaAliases(renderRoot),
        '@univer/render-preset/styles': resolve('src/viewer-support/render-preset/styles.ts'),
        '@univer/render-preset/facades': resolve('src/viewer-support/render-preset/facades.ts'),
        '@univer/render-preset/machine-locale': resolve('src/viewer-support/render-preset/machine-locale.ts'),
        '@univer/render-preset': resolve('src/viewer-support/render-preset/index.ts'),
        '@univer/importrange-formula': resolve('src/viewer-support/importrange-formula/index.ts'),
      },
    },
    plugins: [createPrismComponentEsmPlugin()],
  })
  console.log('built', renderOut)
}

if (target === 'all' || target === 'viewer') {
  const viewerRoot = resolve('src/viewer-app')
  const viewerOut = resolve('artifacts/viewer')
  await buildVite({
    configFile: false,
    root: viewerRoot,
    build: {
      target: 'esnext',
      outDir: viewerOut,
      emptyOutDir: true,
    },
    define: {
      'process.env': '{}',
    },
    resolve: {
      alias: {
        ...createEmbedUiMenuSchemaAliases(viewerRoot),
        '@univer/collab-gateway-contract': resolve('src/gateway-app/contract/index.ts'),
        '@univer/render-preset/styles': resolve('src/viewer-support/render-preset/styles.ts'),
        '@univer/render-preset/facades': resolve('src/viewer-support/render-preset/facades.ts'),
        '@univer/render-preset/machine-locale': resolve('src/viewer-support/render-preset/machine-locale.ts'),
        '@univer/render-preset': resolve('src/viewer-support/render-preset/index.ts'),
        '@univer/importrange-formula': resolve('src/viewer-support/importrange-formula/index.ts'),
      },
    },
    plugins: [react(), tailwindcss(), createPrismComponentEsmPlugin()],
  })
  await assertViewerRibbonUtilityOrder(viewerOut)
  console.log('built', viewerOut)
}

async function assertViewerRibbonUtilityOrder(viewerOut) {
  const html = await readFile(resolve(viewerOut, 'index.html'), 'utf8')
  const cssPaths = [...html.matchAll(/href="([^"]+\.css)"/g)].map(match => match[1])
  if (cssPaths.length === 0) throw new Error('viewer build produced no linked CSS')
  const css = (await Promise.all(cssPaths.map(file =>
    readFile(resolve(viewerOut, file.replace(/^\/+/, '')), 'utf8')
  ))).join('\n')
  const fixedHeight = css.lastIndexOf('.univer-h-6{height:1.5rem}')
  const fullHeight = css.lastIndexOf('.univer-h-full{height:100%}')
  if (fixedHeight < 0 || fullHeight < 0 || fullHeight < fixedHeight) {
    throw new Error('viewer CSS utility order would collapse full-height grid ribbon buttons')
  }
}

function indent(value, spaces) {
  const prefix = ' '.repeat(spaces)
  return value.split('\n').map(line => line.length === 0 ? '' : prefix + line).join('\n')
}
