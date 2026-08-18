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
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { build } from 'esbuild'
import { build as buildVite } from 'vite'
import { createEmbedUiMenuSchemaAliases, createPrismComponentEsmPlugin } from './viewer-vite.mjs'

const target = process.argv[2] ?? 'all'

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
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-skill',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/schemastery',
  // Large / binary packages: never inlined, declared as runtime dependencies
  'libsql',
  '@univerjs-pro/uexcli',
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
  console.log('built lib/index.js + lib/client.js')
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
    '@univerjs-pro/uexcli',
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
    '@univerjs-pro/uexcli',
    '@univerjs-pro/engine-formula-rust-binding',
    '@univerjs-pro/cli-assets',
  ]
  await build({
    entryPoints: ['src/gateway-app/gateway-entry.ts'],
    outfile: gatewayOut,
    bundle: true,
    packages: 'bundle',
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
  console.log('built', viewerOut)
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with ${signal ?? code ?? 'unknown'}`))
    })
  })
}

function indent(value, spaces) {
  const prefix = ' '.repeat(spaces)
  return value.split('\n').map(line => line.length === 0 ? '' : prefix + line).join('\n')
}
