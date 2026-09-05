// @vitest-environment jsdom
import type { Univer } from '@univerjs/core'
import type { Root } from 'react-dom/client'
import type { UnitComparisonViewerValue } from '../src/unit-comparison-viewer.js'
import { LocaleType } from '@univerjs/core'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UNIT_TYPE_SHEET } from '../src/unit-types.js'
import { UnitComparisonViewer } from '../src/unit-comparison-viewer.js'

// Preload the lazy Sheet view outside the test timeout, including its Univer dependencies.
await import('../src/sheet/sheet-comparison-view.js')

describe('UnitComparisonViewer Sheet boundary', () => {
  let root: Root
  let host: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = '<main id="root"></main>'
    host = document.getElementById('root')!
    root = createRoot(host)
  })

  afterEach(async () => {
    flushSync(() => root.unmount())
    await new Promise((resolve) => setTimeout(resolve, 0))
    document.body.innerHTML = ''
  })

  it('renders an inline error when both Sheet snapshots are missing', async () => {
    const createUniver = vi.fn(async () => ({ univer: {} as Univer, dispose: vi.fn() }))

    flushSync(() =>
      root.render(
        <UnitComparisonViewer
          comparison={missingSheetComparison()}
          createUniver={createUniver}
          locale={LocaleType.EN_US}
          darkMode={false}
        />
      )
    )

    await vi.waitFor(() => expect(host.textContent).toContain('Comparison payload is invalid'))
    expect(createUniver).not.toHaveBeenCalled()
  })
})

function missingSheetComparison(): UnitComparisonViewerValue {
  return {
    result: {
      schemaVersion: 1,
      comparisonId: 'cmp-missing-sheet',
      unit: { unitId: 'book-1', type: UNIT_TYPE_SHEET, name: 'Workbook' },
      fidelity: 'history',
      stale: false,
      detail: 'full',
      summary: { total: 0, insert: 0, delete: 0, update: 0, moved: 0, byEntityType: {} },
      coverage: { supportedEntityTypes: [] },
      scopes: [],
      page: { offset: 0, limit: 100, matched: 0, hasMore: false },
      items: [],
      diagnostics: { readiness: 'ready', unsupportedMutationIds: [], codes: [] },
      productContext: { kind: 'sheet', sheets: [] }
    },
    left: { label: 'Before', unitData: null },
    right: { label: 'After', unitData: null }
  }
}
