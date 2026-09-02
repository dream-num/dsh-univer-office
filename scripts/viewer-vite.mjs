import { join } from 'node:path'

/** Map unpublished SDK menu-schema imports to the Viewer compatibility module. */
export function createEmbedUiMenuSchemaAliases(root) {
  const emptyMenuSchemaShim = join(root, 'shims', 'embed-ui-menu-schema.ts')
  return Object.fromEntries(
    [
      '@univerjs-pro/sheets-chart-ui',
      '@univerjs-pro/docs-column-ui',
      '@univerjs-pro/sheets-outline-ui',
      '@univerjs-pro/sheets-pivot-ui',
      '@univerjs-pro/sheets-print',
      '@univerjs-pro/sheets-shape-ui',
      '@univerjs-pro/sheets-sparkline-ui',
      '@univerjs/sheets-conditional-formatting-ui',
      '@univerjs/sheets-data-validation-ui',
      '@univerjs/sheets-drawing-ui',
      '@univerjs/sheets-filter-ui',
      '@univerjs/sheets-hyper-link-ui',
      '@univerjs/sheets-note-ui',
      '@univerjs/sheets-numfmt-ui',
      '@univerjs/sheets-sort-ui',
      '@univerjs/sheets-table-ui',
      '@univerjs/sheets-thread-comment-ui'
    ].map((packageName) => [`${packageName}/menu/schema.ts`, emptyMenuSchemaShim])
  )
}

/** Make Prism component scripts consumable as ESM during the Viewer build. */
export function createPrismComponentEsmPlugin() {
  return {
    name: 'dsh-univer-office-prism-component-esm',
    enforce: 'pre',
    transform(code, id) {
      if (!/[\\/]prismjs[\\/]components[\\/]prism-[^\\/]+\.js(?:\?.*)?$/u.test(id)) return null
      return {
        code: `import Prism from "prismjs";\n${code}\nexport default Prism;\n`,
        map: null
      }
    }
  }
}
