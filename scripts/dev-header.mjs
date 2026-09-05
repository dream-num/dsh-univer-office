import { resolve } from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createEmbedUiMenuSchemaAliases, createPrismComponentEsmPlugin } from './viewer-vite.mjs'
const viewerRoot = resolve('src/viewer-app')
const server = await createServer({
  configFile: false,
  root: viewerRoot,
  define: { 'process.env': '{}' },
  server: { host: '127.0.0.1', port: 5181, strictPort: true },
  resolve: {
    alias: {
      ...createEmbedUiMenuSchemaAliases(viewerRoot),
      '@univer/collab-gateway-contract': resolve('src/gateway-app/contract/index.ts'),
      '@univer/unit-comparison-viewer/styles.css': resolve(
        'packages/unit-comparison-viewer/styles.css'
      ),
      '@univer/unit-comparison-viewer': resolve('packages/unit-comparison-viewer/src/index.ts'),
      '@univer/render-preset/styles': resolve('src/viewer-support/render-preset/styles.ts'),
      '@univer/render-preset/facades': resolve('src/viewer-support/render-preset/facades.ts'),
      '@univer/render-preset/machine-locale': resolve(
        'src/viewer-support/render-preset/machine-locale.ts'
      ),
      '@univer/render-preset': resolve('src/viewer-support/render-preset/index.ts'),
      '@univer/importrange-formula': resolve('src/viewer-support/importrange-formula/index.ts')
    }
  },
  plugins: [react(), tailwindcss(), createPrismComponentEsmPlugin()]
})
await server.listen()
server.printUrls()
