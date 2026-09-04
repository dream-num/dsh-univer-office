import type { ReactElement } from 'react'
import type {
  WorkbookCompareFxDiffPane,
  WorkbookCompareFxDiffSegment
} from './workbook-comparison-model.js'
import { cn } from '../ui/cn.js'

export function WorkbookDiffFxStrip(input: {
  readonly activeCellLabel: string
  readonly pane: 'base' | 'target'
  readonly segments: WorkbookCompareFxDiffPane['segments']
  readonly text: string
}): ReactElement {
  const segments = input.segments !== null && input.segments.length > 0 ? input.segments : null
  const hasMultilineContent = segments
    ? segments.some((segment) => /[\r\n]/u.test(segment.text))
    : /[\r\n]/u.test(input.text)

  return (
    <div className="border-b border-border bg-[color-mix(in_srgb,var(--color-muted)_16%,var(--color-card))] px-3 py-2">
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-10 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-center font-mono text-[11px] font-medium text-foreground shadow-xs"
          data-testid={`${input.pane}-workbook-diff-fx-cell`}
        >
          {input.activeCellLabel}
        </div>
        <div className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 shadow-xs">
          <div
            className={cn(
              'min-h-10 max-h-20 overflow-y-auto pr-1 text-left font-mono text-[11px] leading-snug text-foreground',
              hasMultilineContent ? 'py-2' : 'flex items-center py-0'
            )}
            data-testid={`${input.pane}-workbook-diff-fx-text`}
          >
            <span className="block min-w-0 whitespace-pre-wrap break-all">
              {segments
                ? segments.map((segment, index) => (
                    <span
                      className={getFxSegmentClassName(segment.kind)}
                      data-workbook-fx-segment-kind={segment.kind}
                      key={`${segment.kind}:${index}:${segment.text}`}
                    >
                      {segment.text}
                    </span>
                  ))
                : input.text || '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function getFxSegmentClassName(kind: WorkbookCompareFxDiffSegment['kind']): string {
  if (kind === 'delete') {
    return 'rounded-sm bg-diff-delete-muted text-diff-delete line-through decoration-diff-delete/80'
  }
  if (kind === 'insert') {
    return 'rounded-sm bg-diff-insert-muted text-diff-insert'
  }
  return ''
}
