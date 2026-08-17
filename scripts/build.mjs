// Build the plugin application from source over the Univer SDK — the single
// build mode (pnpm). Nothing is vendored from univer-cli; everything is
// compiled from src/ with the SDK packages installed from the registry.
//
//   pnpm run build:lib     → lib/index.js (host) + lib/client.js (client bundle)
//   pnpm run build:worker  → vendor/unit-content/artifacts/unit-content-worker.mjs
//   pnpm run build         → both
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { builtinModules } from 'node:module'
import { build } from 'esbuild'

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
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/schemastery',
  // Large / binary packages: never inlined, declared as runtime dependencies
  'libsql',
  '@univerjs-pro/uexcli',
  '@univerjs-pro/engine-formula-rust-binding',
  '@univerjs-pro/cli-assets',
]

if (target === 'all' || target === 'lib') {
  await rm('lib/types', { recursive: true, force: true })
  await mkdir('lib', { recursive: true })
  await run(process.execPath, ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.json'])

  await build({
    entryPoints: ['src/host/index.ts'],
    outfile: 'lib/index.js',
    bundle: true,
    packages: 'bundle',
    external,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    sourcemap: true,
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
  const workerOut = 'vendor/unit-content/artifacts/unit-content-worker.mjs'
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
  // Collaboration Gateway: a standalone server built from the vendored-in
  // gateway application sources (src/gateway-app) over the collaboration SDK.
  const gatewayOut = 'vendor/collaboration/artifacts/gateway.cjs'
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
