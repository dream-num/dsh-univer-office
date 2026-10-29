import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// Node imports the built Host bundle directly. Through Vite's module runner, every isolated test
// file would re-transform the multi-megabyte `lib/index.js`, which dominated suite time.
const nativeBuiltBundle = { deps: { external: [/\/lib\/[^/]+\.js$/] } }

// Three tiers, selected with `--project`:
// - unit: source-level, no build, no Gateway.
// - integration: built `lib/` and `artifacts/` from the same checkout, real Gateway and Workers.
// - e2e: a real render browser, over built artifacts or bundled source.
// Integration and e2e files start their own Gateway or browser; they run one file at a time
// because each Gateway, Worker pool, and render browser is memory-heavy.
export default defineConfig({
  test: {
    projects: [
      {
        resolve: {
          // Mirrors the `paths` in tsconfig.viewer.json for source-level Viewer modules.
          alias: {
            '@univer/collab-gateway-contract': source('./src/gateway-app/contract/index.ts')
          }
        },
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
          environment: 'node',
          testTimeout: 60_000
        }
      },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          server: nativeBuiltBundle,
          environment: 'node',
          fileParallelism: false,
          testTimeout: 120_000,
          hookTimeout: 180_000
        }
      },
      {
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.test.ts'],
          server: nativeBuiltBundle,
          environment: 'node',
          fileParallelism: false,
          testTimeout: 180_000,
          hookTimeout: 180_000
        }
      },
      'packages/unit-comparison-viewer'
    ]
  }
})
