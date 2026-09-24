import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const cache = resolve('node_modules/.cache')
await mkdir(cache, { recursive: true })
const bundleDirectory = await mkdtemp(join(cache, 'preview-formula-'))

try {
  const outfile = join(bundleDirectory, 'preview-formula.mjs')
  await build({
    stdin: {
      contents: `export { startPreviewSheetFormulaCalculation } from './src/viewer-app/core/preview-formula.ts';`,
      resolveDir: resolve('.')
    },
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'neutral'
  })
  const { startPreviewSheetFormulaCalculation } = await import(pathToFileURL(outfile).href)

  const applied = []
  await startPreviewSheetFormulaCalculation(
    async () => {
      applied.push('start')
    },
    async () => {
      applied.push('wait')
    }
  )
  assert.deepEqual(applied, ['start', 'wait'])

  let waited = false
  await startPreviewSheetFormulaCalculation(
    async () => {
      throw new Error('formula trigger failed before Rendered')
    },
    async () => {
      waited = true
    }
  )
  assert.equal(waited, false)

  await startPreviewSheetFormulaCalculation(
    async () => undefined,
    async () => {
      throw new Error('Calculation end timeout')
    }
  )
} finally {
  await rm(bundleDirectory, { recursive: true, force: true })
}

console.log('preview formula startup OK')
