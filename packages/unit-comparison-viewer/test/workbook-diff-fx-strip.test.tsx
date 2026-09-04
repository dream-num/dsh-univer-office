import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WorkbookDiffFxStrip } from '../src/sheet/workbook-fx-strip.js'

describe('workbook diff formula strip', () => {
  it('renders deleted and inserted formula tokens with pane-local semantics', () => {
    const baseMarkup = renderToStaticMarkup(
      <WorkbookDiffFxStrip
        activeCellLabel="C4"
        pane="base"
        segments={[
          { kind: 'equal', text: '=SUM(A1:' },
          { kind: 'delete', text: 'A3' },
          { kind: 'equal', text: ')' }
        ]}
        text="=SUM(A1:A3)"
      />
    )
    const currentMarkup = renderToStaticMarkup(
      <WorkbookDiffFxStrip
        activeCellLabel="C4"
        pane="target"
        segments={[
          { kind: 'equal', text: '=SUM(A1:' },
          { kind: 'insert', text: 'A4' },
          { kind: 'equal', text: ')' }
        ]}
        text="=SUM(A1:A4)"
      />
    )

    expect(baseMarkup).toContain('data-testid="base-workbook-diff-fx-cell"')
    expect(baseMarkup).toContain('data-workbook-fx-segment-kind="delete"')
    expect(baseMarkup).toContain('line-through')
    expect(currentMarkup).toContain('data-testid="target-workbook-diff-fx-cell"')
    expect(currentMarkup).toContain('data-workbook-fx-segment-kind="insert"')
    expect(currentMarkup).toContain('bg-diff-insert-muted')
  })
})
