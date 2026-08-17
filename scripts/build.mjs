import { mkdir, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { build } from 'esbuild'

await rm('lib/types', { recursive: true, force: true })
await mkdir('lib', { recursive: true })
await run(process.execPath, ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.json'])
await build({
  entryPoints: ['src/host/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  packages: 'external',
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  legalComments: 'none',
})
const client = await build({
  entryPoints: ['src/client/index.tsx'],
  bundle: true,
  write: false,
  packages: 'external',
  platform: 'browser',
  target: 'es2022',
  format: 'cjs',
  legalComments: 'none',
})
const clientCode = client.outputFiles[0]?.text
if (clientCode === undefined) throw new Error('client build produced no JavaScript')
await writeFile('lib/client.js', `window.__ModuleLoader__.load({\n  id: "dsh-univer-office",\n  factory: (require) => {\n    var module = { exports: {} };\n    var exports = module.exports;\n${indent(clientCode, 4)}\n    return module.exports;\n  }\n});\n`)

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
