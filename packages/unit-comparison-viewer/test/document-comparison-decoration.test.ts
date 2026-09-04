import {
  BooleanNumber,
  CustomRangeType,
  DataStreamTreeTokenType,
  DocumentBlockRangeType,
  ObjectRelativeFromH,
  ObjectRelativeFromV,
  PresetListType,
  TableAlignmentType,
  TableRowHeightRule,
  TableSizeType,
  TableTextWrapType,
  TextX,
  TextXActionType,
  UniverInstanceType,
  validateDocumentStructure,
  type IDocumentData,
  type ITextRun
} from '@univerjs/core'
import { describe, expect, it } from 'vitest'
import { DocsUnitComparisonAdapter } from '@univerjs-pro/docs-history'
import { structuralDiffItemsFromContext } from '../src/comparison-presentation'
import {
  decorateDocumentComparisonSide as renderDocumentComparisonSide,
  type ComparisonSide
} from '../src/native/document-decoration'

/** Exercise the real SDK output through the renderer, without an application-side diff fallback. */
function decorateDocumentComparisonSide(
  current: IDocumentData,
  peer: IDocumentData,
  side: ComparisonSide,
  selectedEntityType?: string
): IDocumentData {
  const result = new DocsUnitComparisonAdapter().compare({
    unitId: 'doc-1',
    leftData: side === 'left' ? current : peer,
    rightData: side === 'right' ? current : peer,
    leftChangesets: [],
    rightChangesets: []
  })
  if (result.productContext?.type !== UniverInstanceType.UNIVER_DOC)
    throw new Error('Expected Doc alignment')
  const items = structuralDiffItemsFromContext({
    items: result.items.map((item) => ({
      ...item,
      title: item.displayName ?? item.stableId,
      details: []
    }))
  })
  const selectedItemId =
    selectedEntityType === undefined
      ? undefined
      : items.find((item) => item.entityType === selectedEntityType)?.id
  return renderDocumentComparisonSide(current, peer, side, {
    items,
    alignment: result.productContext.paragraphAlignment.map((row, index) => {
      const parent =
        row.segmentPath === undefined ? undefined : `${row.segmentPath[0]}:${row.segmentPath[1]}`
      const item = items.find(
        (candidate) =>
          candidate.entityType === 'paragraph' &&
          candidate.stableId === row.stableId &&
          candidate.parentStableId === parent
      )
      return {
        ...row,
        id: String(index),
        leftIndex: row.leftPosition,
        rightIndex: row.rightPosition,
        kind: item?.kind ?? 'equal',
        moved: item?.moved ?? false
      }
    }),
    ...(selectedItemId === undefined ? {} : { selectedItemId })
  })
}

function document(text: string): IDocumentData {
  return {
    id: 'doc-1',
    documentStyle: {},
    body: {
      dataStream: `${text}\r\0`,
      paragraphs: [
        { startIndex: text.length, paragraphId: 'paragraph-1' },
        { startIndex: text.length + 1, paragraphId: 'paragraph-end' }
      ]
    }
  }
}

function coloredText(data: IDocumentData): Array<{ text: string; color: string; strike: boolean }> {
  const stream = data.body?.dataStream ?? ''
  return (data.body?.textRuns ?? []).flatMap((run: ITextRun) => {
    const color = run.ts?.bg?.rgb
    return typeof color !== 'string'
      ? []
      : [{ text: stream.slice(run.st, run.ed), color, strike: run.ts?.st?.s === 1 }]
  })
}

function paragraphs(
  values: readonly { readonly id: string; readonly text: string }[]
): IDocumentData {
  let offset = 0
  const records = values.map(({ id, text }) => {
    offset += text.length
    const paragraph = { startIndex: offset, paragraphId: id }
    offset += 1
    return paragraph
  })
  return {
    id: 'doc-1',
    documentStyle: {},
    body: {
      dataStream: `${values.map((value) => value.text).join('\r')}\r\0`,
      paragraphs: [...records, { startIndex: offset, paragraphId: 'paragraph-end' }]
    }
  }
}

describe('document comparison decoration', () => {
  it('keeps paragraph replacements inside their existing table cell when native paragraph IDs are regenerated', () => {
    const before = structuredDocument(['Intro', 'table', 'After'], {
      table: [['Label', 'Old value', 'Status']]
    })
    const after = structuredDocument(['Intro', 'table', 'After'], {
      table: [['Label', 'New value', 'Status']]
    })
    const left = decorateDocumentComparisonSide(before, after, 'left')
    const right = decorateDocumentComparisonSide(after, before, 'right')
    for (const view of [left, right]) {
      expect(validateDocumentStructure(view)).toEqual([])
      expect(view.tableSource!['table-1']!.tableRows[0]!.tableCells).toHaveLength(3)
      expect(view.tableSource!['table-1']!.tableColumns).toHaveLength(3)
      expect(view.body?.dataStream).toContain('Old value')
      expect(view.body?.dataStream).toContain('New value')
    }
    expect(left.body?.dataStream).toBe(right.body?.dataStream)
  })

  it.each([0, 1])(
    'preserves grid column widths when inserting after a merged cell (gridBefore=%s)',
    (gridBefore) => {
      const before = structuredDocument(['Intro', 'table', 'After'], { table: [['a', 'c']] })
      const after = structuredDocument(['Intro', 'table', 'After'], {
        table: [['a', 'Added content', 'c']]
      })
      for (const [data, widths] of [
        [before, [...(gridBefore ? [60] : []), 90, 130, 170]],
        [after, [...(gridBefore ? [60] : []), 90, 130, 210, 170]]
      ] as const) {
        const table = data.tableSource!['table-1']!
        table.tableRows[0]!.gridBefore = gridBefore
        table.tableRows[0]!.tableCells[0]!.columnSpan = 2
        table.tableColumns = widths.map((v) => ({
          size: { type: TableSizeType.SPECIFIED, width: { v } }
        }))
        table.size.width.v = widths.reduce((sum, width) => sum + width, 0)
        expect(validateDocumentStructure(data)).toEqual([])
      }
      const original = JSON.stringify([before, after])
      for (const side of ['left', 'right'] as const) {
        const ghost = decorateDocumentComparisonSide(before, after, side)
        const actual = decorateDocumentComparisonSide(
          after,
          before,
          side === 'left' ? 'right' : 'left'
        )
        expect(ghost.body?.dataStream).toBe(actual.body?.dataStream)
        expect(validateDocumentStructure(ghost)).toEqual([])
        expect(ghost.tableSource!['table-1']!.tableColumns).toEqual(
          actual.tableSource!['table-1']!.tableColumns
        )
        expect(ghost.tableSource!['table-1']!.size).toEqual(actual.tableSource!['table-1']!.size)
        expect(
          ghost.tableSource!['table-1']!.tableRows[0]!.tableCells.map(
            (cell) => cell.columnSpan ?? 1
          )
        ).toEqual([2, 1, 1])
      }
      expect(JSON.stringify([before, after])).toBe(original)
    }
  )

  it.each(['row', 'cell', 'column'] as const)(
    'keeps independent bilateral %s insertions in the same SDK alignment order',
    (kind) => {
      const create = (id: string): IDocumentData =>
        kind === 'column'
          ? structuredDocument(['Intro', 'columns', 'After'], { columns: ['a', id, 'c'] })
          : structuredDocument(['Intro', 'table', 'After'], {
              table: kind === 'row' ? [['a'], [id], ['c']] : [['a', id, 'c']]
            })
      const left = create('Left addition')
      const right = create('Right addition')
      const leftView = decorateDocumentComparisonSide(left, right, 'left')
      const rightView = decorateDocumentComparisonSide(right, left, 'right')
      expect(leftView.body?.dataStream).toBe(rightView.body?.dataStream)
      expect(validateDocumentStructure(leftView)).toEqual([])
      expect(validateDocumentStructure(rightView)).toEqual([])
      expect(coloredText(leftView)).toContainEqual({
        text: 'Left addition',
        color: 'rgba(22, 163, 74, 0.24)',
        strike: false
      })
      expect(coloredText(leftView)).toContainEqual({
        text: 'Right addition',
        color: 'rgba(220, 38, 38, 0.24)',
        strike: true
      })
      expect(coloredText(rightView)).toContainEqual({
        text: 'Left addition',
        color: 'rgba(220, 38, 38, 0.24)',
        strike: true
      })
      expect(coloredText(rightView)).toContainEqual({
        text: 'Right addition',
        color: 'rgba(22, 163, 74, 0.24)',
        strike: false
      })
      expect(decorateDocumentComparisonSide(left, right, 'right').body).toEqual(leftView.body)
    }
  )

  it.each(['row', 'cell', 'column'] as const)(
    'preserves adjacent and boundary %s slots in both directions',
    (kind) => {
      const create = (ids: readonly string[]): IDocumentData =>
        kind === 'column'
          ? structuredDocument(['Intro', 'columns', 'After'], { columns: ids })
          : structuredDocument(['Intro', 'table', 'After'], {
              table: kind === 'row' ? ids.map((id) => [id]) : [ids]
            })
      const before = create(['a', 'c'])
      const after = create([
        'First addition',
        'a',
        'Middle addition',
        'Adjacent addition',
        'c',
        'Last addition'
      ])
      const original = JSON.stringify([before, after])
      for (const side of ['left', 'right'] as const) {
        const ghost = decorateDocumentComparisonSide(before, after, side)
        const actual = decorateDocumentComparisonSide(
          after,
          before,
          side === 'left' ? 'right' : 'left'
        )
        expect(ghost.body?.dataStream).toBe(after.body?.dataStream)
        expect(actual.body?.dataStream).toBe(after.body?.dataStream)
        expect(validateDocumentStructure(ghost)).toEqual([])
        expect(validateDocumentStructure(actual)).toEqual([])
        for (const text of [
          'First addition',
          'Middle addition',
          'Adjacent addition',
          'Last addition'
        ]) {
          expect(coloredText(ghost)).toContainEqual({
            text,
            color: 'rgba(220, 38, 38, 0.24)',
            strike: true
          })
          expect(coloredText(actual)).toContainEqual({
            text,
            color: 'rgba(22, 163, 74, 0.24)',
            strike: false
          })
        }
        if (kind === 'column') {
          expect(ghost.body?.columnGroups).toEqual(after.body?.columnGroups)
        } else {
          expect(ghost.tableSource!['table-1']!.tableColumns).toEqual(
            after.tableSource!['table-1']!.tableColumns
          )
          expect(
            ghost.tableSource!['table-1']!.tableRows.map((row) => row.tableCells.length)
          ).toEqual(after.tableSource!['table-1']!.tableRows.map((row) => row.tableCells.length))
        }
      }
      expect(JSON.stringify([before, after])).toBe(original)
    }
  )

  it.each(['row', 'cell', 'column'] as const)(
    'mirrors a missing whole %s inside an existing container',
    (kind) => {
      const before =
        kind === 'column'
          ? structuredDocument(['Intro', 'columns', 'After'], { columns: ['a', 'c'] })
          : structuredDocument(['Intro', 'table', 'After'], {
              table: kind === 'row' ? [['a'], ['c']] : [['a', 'c']]
            })
      const after =
        kind === 'column'
          ? structuredDocument(['Intro', 'columns', 'After'], {
              columns: ['a', 'Added content', 'c']
            })
          : structuredDocument(['Intro', 'table', 'After'], {
              table:
                kind === 'row' ? [['a'], ['Added content'], ['c']] : [['a', 'Added content', 'c']]
            })
      const original = JSON.stringify([before, after])
      expect(validateDocumentStructure(before)).toEqual([])
      expect(validateDocumentStructure(after)).toEqual([])
      for (const side of ['left', 'right'] as const) {
        const ghost = decorateDocumentComparisonSide(before, after, side)
        const actual = decorateDocumentComparisonSide(
          after,
          before,
          side === 'left' ? 'right' : 'left'
        )
        expect(ghost.body?.dataStream).toBe(after.body?.dataStream)
        expect(actual.body?.dataStream).toBe(after.body?.dataStream)
        expect(validateDocumentStructure(ghost)).toEqual([])
        expect(validateDocumentStructure(actual)).toEqual([])
        expect(coloredText(ghost)).toContainEqual({
          text: 'Added content',
          color: 'rgba(220, 38, 38, 0.24)',
          strike: true
        })
        expect(coloredText(actual)).toContainEqual({
          text: 'Added content',
          color: 'rgba(22, 163, 74, 0.24)',
          strike: false
        })
        if (kind === 'column') {
          expect(ghost.body?.columnGroups?.[0]?.columns).toEqual(
            after.body?.columnGroups?.[0]?.columns
          )
        } else {
          const table = ghost.tableSource!['table-1']!
          expect(table.tableRows.map((row) => row.tableCells.length)).toEqual(
            after.tableSource!['table-1']!.tableRows.map((row) => row.tableCells.length)
          )
          expect(table.tableColumns).toEqual(after.tableSource!['table-1']!.tableColumns)
          expect(
            table.tableRows[kind === 'row' ? 1 : 0]?.tableCells[kind === 'cell' ? 1 : 0]
              ?.backgroundColor?.rgb
          ).toBe('rgba(220, 38, 38, 0.12)')
          expect(
            actual.tableSource!['table-1']!.tableRows[kind === 'row' ? 1 : 0]?.tableCells[
              kind === 'cell' ? 1 : 0
            ]?.backgroundColor?.rgb
          ).toBe('rgba(22, 163, 74, 0.12)')
        }
      }
      expect(JSON.stringify([before, after])).toBe(original)
    }
  )

  it.each(
    [
      ['table', 'cell'],
      ['columns', 'column-1'],
      ['quote', 'block-copy'],
      ['nested', 'cell']
    ].flatMap(([kind, targetId]) =>
      ['before', 'after'].map((placement) => [kind!, targetId!, placement])
    )
  )(
    'mirrors inserted and empty paragraphs inside an existing %s (%s, %s)',
    (kind, targetId, placement) => {
      const before = structuredDocument(['Intro', kind, 'After'])
      const after = structuredDocument(['Intro', kind, 'After'])
      const body = after.body!
      const paragraphEnd = body.paragraphs!.find(
        (paragraph) => paragraph.paragraphId === targetId
      )!.startIndex
      const start =
        kind === 'quote'
          ? body.blockRanges![0]!.startIndex + 1
          : body.dataStream.indexOf(kind === 'columns' ? 'First column' : 'Table cell')
      const offset = placement === 'after' ? paragraphEnd + 1 : start
      const text = 'Review addition'
      TextX.apply(body, [
        { t: TextXActionType.RETAIN, len: offset },
        {
          t: TextXActionType.INSERT,
          len: text.length + 2,
          body: {
            dataStream: `${text}\r\r`,
            paragraphs: [
              { paragraphId: 'addition', startIndex: text.length },
              { paragraphId: 'empty-addition', startIndex: text.length + 1 }
            ]
          }
        }
      ])
      const original = JSON.stringify([before, after])
      expect(validateDocumentStructure(after)).toEqual([])
      for (const side of ['left', 'right'] as const) {
        const ghost = decorateDocumentComparisonSide(before, after, side)
        const actual = decorateDocumentComparisonSide(
          after,
          before,
          side === 'left' ? 'right' : 'left'
        )
        expect(ghost.body?.dataStream).toBe(after.body?.dataStream)
        expect(actual.body?.dataStream).toBe(after.body?.dataStream)
        expect(validateDocumentStructure(ghost)).toEqual([])
        expect(validateDocumentStructure(actual)).toEqual([])
        for (const key of [
          'tables',
          'columnGroups',
          'blockRanges',
          'sectionBreaks',
          'customRanges'
        ] as const) {
          expect(ghost.body?.[key]).toEqual(after.body?.[key])
        }
        expect(coloredText(ghost)).toContainEqual({
          text,
          color: 'rgba(220, 38, 38, 0.24)',
          strike: true
        })
        expect(coloredText(actual)).toContainEqual({
          text,
          color: 'rgba(22, 163, 74, 0.24)',
          strike: false
        })
        expect(ghost.body?.paragraphs).toHaveLength(after.body?.paragraphs?.length ?? 0)
      }
      expect(JSON.stringify([before, after])).toBe(original)
    }
  )

  it.each(['table', 'columns', 'quote', 'callout', 'code', 'nested'] as const)(
    'mirrors a whole missing %s with valid native structure and symmetric red/green content',
    (kind) => {
      const absent = structuredDocument(['Intro', 'After'])
      const present = structuredDocument(['Intro', kind, 'After'])
      const original = JSON.stringify([absent, present])
      expect(validateDocumentStructure(absent)).toEqual([])
      expect(validateDocumentStructure(present)).toEqual([])
      for (const side of ['left', 'right'] as const) {
        const ghost = decorateDocumentComparisonSide(absent, present, side)
        const actual = decorateDocumentComparisonSide(
          present,
          absent,
          side === 'left' ? 'right' : 'left'
        )
        expect(ghost.body?.dataStream).toBe(present.body?.dataStream)
        expect(actual.body?.dataStream).toBe(present.body?.dataStream)
        expect(validateDocumentStructure(ghost)).toEqual([])
        expect(validateDocumentStructure(actual)).toEqual([])
        for (const key of [
          'tables',
          'columnGroups',
          'blockRanges',
          'customRanges',
          'customBlocks'
        ] as const) {
          expect(ghost.body?.[key] ?? []).toEqual(present.body?.[key] ?? [])
          expect(actual.body?.[key] ?? []).toEqual(present.body?.[key] ?? [])
        }
        const evidence = present.body!.dataStream.indexOf('Evidence')
        if (evidence >= 0) {
          for (const rendered of [ghost, actual]) {
            expect(
              rendered.body?.textRuns?.find((run) => run.st <= evidence && run.ed > evidence)?.ts
                ?.bl
            ).toBe(BooleanNumber.TRUE)
          }
        }
        expect(
          coloredText(ghost).some((run) => run.color === 'rgba(220, 38, 38, 0.24)' && run.strike)
        ).toBe(true)
        expect(
          coloredText(actual).some((run) => run.color === 'rgba(22, 163, 74, 0.24)' && !run.strike)
        ).toBe(true)
        if (present.tableSource?.['table-1'] !== undefined) {
          expect(
            ghost.tableSource?.['table-1']?.tableRows[0]?.tableCells[0]?.backgroundColor?.rgb
          ).toBe('rgba(220, 38, 38, 0.12)')
          expect(
            actual.tableSource?.['table-1']?.tableRows[0]?.tableCells[0]?.backgroundColor?.rgb
          ).toBe('rgba(22, 163, 74, 0.12)')
        }
        expect(
          new Set(ghost.body?.paragraphs?.map((paragraph) => paragraph.paragraphId)).size
        ).toBe(ghost.body?.paragraphs?.length)
      }
      expect(JSON.stringify([absent, present])).toBe(original)
    }
  )

  it('places ordinary paragraph ghosts outside the adjacent table and preserves their order', () => {
    const before = structuredDocument(['Intro', 'table', 'After'])
    const after = structuredDocument(['Intro', 'Before table', 'table', 'After table', 'After'])
    const rendered = decorateDocumentComparisonSide(before, after, 'left')
    expect(rendered.body?.dataStream).toBe(after.body?.dataStream)
    expect(rendered.body?.tables).toEqual(after.body?.tables)
    expect(validateDocumentStructure(rendered)).toEqual([])
  })

  it('keeps adjacent structural and ordinary ghosts in SDK alignment order', () => {
    const before = structuredDocument(['Intro', 'After'])
    const after = structuredDocument([
      'Intro',
      'Before table',
      'table',
      'Between',
      'columns',
      'After'
    ])
    const rendered = decorateDocumentComparisonSide(before, after, 'left')
    expect(rendered.body?.dataStream).toBe(after.body?.dataStream)
    expect(validateDocumentStructure(rendered)).toEqual([])
  })

  it('inserts a trailing ghost before the native root section sentinel', () => {
    const before = structuredDocument(['Intro'])
    const after = structuredDocument(['Intro', 'Tail'])
    const rendered = decorateDocumentComparisonSide(before, after, 'left')
    expect(rendered.body?.dataStream).toBe(after.body?.dataStream)
    expect(validateDocumentStructure(rendered)).toEqual([])
  })

  it('does not infer missing structures from snapshots without SDK differences', () => {
    const before = structuredDocument(['Intro', 'After'])
    const after = structuredDocument(['Intro', 'nested', 'After'])
    const rendered = renderDocumentComparisonSide(before, after, 'left', {
      items: [],
      alignment: []
    })
    expect(rendered.body).toEqual(before.body)
    expect(rendered.tableSource).toEqual(before.tableSource)
    expect(rendered.drawings).toEqual(before.drawings)
  })

  it('never invents a difference when the API reports an unchanged paragraph', () => {
    const left = document('Changed local content')
    const right = document('Different peer content')
    const rendered = renderDocumentComparisonSide(left, right, 'left', {
      items: [],
      alignment: [
        {
          id: 'paired',
          stableId: 'paragraph-1',
          kind: 'equal',
          moved: false,
          leftIndex: 0,
          rightIndex: 0,
          leftNativeStableId: 'paragraph-1',
          rightNativeStableId: 'paragraph-1'
        }
      ]
    })
    expect(coloredText(rendered)).toEqual([])
  })

  it('uses SDK character segments without splitting a supplementary Unicode character', () => {
    const left = decorateDocumentComparisonSide(document('A😀B'), document('A🤝B'), 'left')
    const right = decorateDocumentComparisonSide(document('A🤝B'), document('A😀B'), 'right')
    expect(coloredText(left)).toContainEqual({
      text: '😀',
      color: 'rgba(37, 99, 235, 0.22)',
      strike: false
    })
    expect(coloredText(right)).toContainEqual({
      text: '🤝',
      color: 'rgba(37, 99, 235, 0.22)',
      strike: false
    })
  })

  it('marks replacements blue on both sides at character precision', () => {
    const left = decorateDocumentComparisonSide(
      document('Ship in August'),
      document('Ship in September'),
      'left'
    )
    const right = decorateDocumentComparisonSide(
      document('Ship in September'),
      document('Ship in August'),
      'right'
    )

    expect(coloredText(left)).toContainEqual({
      text: 'August',
      color: 'rgba(37, 99, 235, 0.22)',
      strike: false
    })
    expect(coloredText(right)).toContainEqual({
      text: 'September',
      color: 'rgba(37, 99, 235, 0.22)',
      strike: false
    })
  })

  it('strengthens only the selected semantic difference', () => {
    const normal = decorateDocumentComparisonSide(
      document('Ship in August'),
      document('Ship in September'),
      'left'
    )
    const selected = decorateDocumentComparisonSide(
      document('Ship in August'),
      document('Ship in September'),
      'left',
      'paragraph'
    )

    expect(coloredText(normal)).toContainEqual({
      text: 'August',
      color: 'rgba(37, 99, 235, 0.22)',
      strike: false
    })
    expect(coloredText(selected)).toContainEqual({
      text: 'August',
      color: 'rgba(37, 99, 235, 0.42)',
      strike: false
    })
  })

  it('marks pure deletion red and pure insertion green', () => {
    const left = decorateDocumentComparisonSide(
      document('Ship legacy mode'),
      document('Ship mode'),
      'left'
    )
    const right = decorateDocumentComparisonSide(
      document('Ship AI mode'),
      document('Ship mode'),
      'right'
    )

    expect(coloredText(left)).toContainEqual({
      text: 'legacy ',
      color: 'rgba(220, 38, 38, 0.24)',
      strike: true
    })
    expect(coloredText(right)).toContainEqual({
      text: 'AI ',
      color: 'rgba(22, 163, 74, 0.24)',
      strike: false
    })
  })

  it('projects inserted paragraphs as a green row and an aligned red strikethrough ghost', () => {
    const leftSource = paragraphs([
      { id: 'intro', text: 'Intro' },
      { id: 'outro', text: 'Outro' }
    ])
    const rightSource = paragraphs([
      { id: 'intro', text: 'Intro' },
      { id: 'new-paragraph', text: 'A newly added paragraph' },
      { id: 'outro', text: 'Outro' }
    ])
    const left = decorateDocumentComparisonSide(leftSource, rightSource, 'left')
    const right = decorateDocumentComparisonSide(rightSource, leftSource, 'right')

    expect(left.body?.dataStream).toBe(right.body?.dataStream)
    expect(coloredText(left)).toContainEqual({
      text: 'A newly added paragraph',
      color: 'rgba(220, 38, 38, 0.24)',
      strike: true
    })
    expect(coloredText(right)).toContainEqual({
      text: 'A newly added paragraph',
      color: 'rgba(22, 163, 74, 0.24)',
      strike: false
    })
  })

  it('uses paragraph shading to keep inserted empty paragraphs visible on both sides', () => {
    const left = paragraphs([
      { id: 'intro', text: 'Intro' },
      { id: 'outro', text: 'Outro' }
    ])
    const right = paragraphs([
      { id: 'intro', text: 'Intro' },
      { id: 'empty', text: '' },
      { id: 'outro', text: 'Outro' }
    ])
    const decoratedLeft = decorateDocumentComparisonSide(left, right, 'left')
    const decoratedRight = decorateDocumentComparisonSide(right, left, 'right')
    const leftEmpty = decoratedLeft.body?.paragraphs?.find(
      (paragraph) => paragraph.paragraphId === 'empty'
    )
    const rightEmpty = decoratedRight.body?.paragraphs?.find(
      (paragraph) => paragraph.paragraphId === 'empty'
    )

    expect(leftEmpty?.paragraphStyle?.shading?.backgroundColor?.rgb).toBe('rgba(220, 38, 38, 0.12)')
    expect(rightEmpty?.paragraphStyle?.shading?.backgroundColor?.rgb).toBe(
      'rgba(22, 163, 74, 0.12)'
    )
  })

  it('keeps a completed checklist glyph without leaking its inherited strike into the right diff', () => {
    const before = document('Publish the readiness packet.')
    before.body!.paragraphs![0]!.bullet = {
      listId: 'check-list',
      listType: PresetListType.CHECK_LIST,
      nestingLevel: 0
    }
    const after = document('Publish the readiness packet and attach the audit export.')
    after.body!.paragraphs![0]!.bullet = {
      listId: 'check-list',
      listType: PresetListType.CHECK_LIST_CHECKED,
      nestingLevel: 0
    }

    const decorated = decorateDocumentComparisonSide(after, before, 'right')
    const publishRun = decorated.body?.textRuns?.find((run) => run.st <= 1 && run.ed > 1)

    expect(decorated.body?.paragraphs?.[0]?.bullet?.listType).toBe(
      PresetListType.CHECK_LIST_CHECKED
    )
    expect(publishRun?.ts?.st?.s).toBe(BooleanNumber.FALSE)
  })

  it('paints table-cell and column text at character precision without coloring structure tokens', () => {
    const before = nestedDocument('68%', 'Customer signal', 'left')
    const after = nestedDocument('81%', 'Launch signal', 'right')

    const left = decorateDocumentComparisonSide(before, after, 'left')
    const right = decorateDocumentComparisonSide(after, before, 'right')

    expect(coloredText(left)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '68', color: 'rgba(37, 99, 235, 0.22)' }),
        expect.objectContaining({ text: 'Customer', color: 'rgba(37, 99, 235, 0.22)' })
      ])
    )
    expect(coloredText(right)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '81', color: 'rgba(37, 99, 235, 0.22)' }),
        expect.objectContaining({ text: 'Launch', color: 'rgba(37, 99, 235, 0.22)' })
      ])
    )
    expect(left.body?.dataStream).toBe(before.body?.dataStream)
    expect(right.body?.dataStream).toBe(after.body?.dataStream)
  })
})

/** Native-valid fixtures, including inclusive block/column ends and exclusive table ends. */
function structuredDocument(
  parts: readonly string[],
  options?: {
    readonly table?: readonly (readonly string[])[]
    readonly columns?: readonly string[]
  }
): IDocumentData {
  const T = DataStreamTreeTokenType
  const data: IDocumentData = {
    id: 'doc-structures',
    documentStyle: {},
    body: {
      dataStream: '',
      paragraphs: [],
      sectionBreaks: [],
      tables: [],
      columnGroups: [],
      blockRanges: [],
      customRanges: [],
      customBlocks: [],
      textRuns: []
    }
  }
  const body = data.body!
  const token = (value: string): void => {
    body.dataStream += value
  }
  const paragraph = (id: string, text: string): void => {
    token(text)
    body.paragraphs!.push({ paragraphId: id, startIndex: body.dataStream.length })
    token(T.PARAGRAPH)
  }
  const section = (id: string): void => {
    body.sectionBreaks!.push({ sectionId: id, startIndex: body.dataStream.length })
    token(T.SECTION_BREAK)
  }
  const table = (): void => {
    const startIndex = body.dataStream.length
    const grid = options?.table ?? [['cell']]
    token(T.TABLE_START)
    for (const row of grid) {
      token(T.TABLE_ROW_START)
      for (const cell of row) {
        token(T.TABLE_CELL_START)
        paragraph(cell, cell === 'cell' ? 'Table cell' : cell)
        section(`${cell}-section`)
        token(T.TABLE_CELL_END)
      }
      token(T.TABLE_ROW_END)
    }
    token(T.TABLE_END)
    body.tables!.push({ tableId: 'table-1', startIndex, endIndex: body.dataStream.length })
    ;(data.tableSource ??= {})['table-1'] = {
      tableId: 'table-1',
      tableRows: grid.map((row) => ({
        tableCells: row.map(() => ({})),
        trHeight: { val: { v: 24 }, hRule: TableRowHeightRule.AT_LEAST }
      })),
      tableColumns: Array.from({ length: Math.max(...grid.map((row) => row.length)) }, () => ({
        size: { type: TableSizeType.SPECIFIED, width: { v: 260 } }
      })),
      align: TableAlignmentType.START,
      indent: { v: 0 },
      textWrap: TableTextWrapType.NONE,
      position: {
        positionH: { relativeFrom: ObjectRelativeFromH.PAGE },
        positionV: { relativeFrom: ObjectRelativeFromV.PAGE }
      },
      dist: { distT: 0, distB: 0, distL: 0, distR: 0 },
      size: {
        type: TableSizeType.SPECIFIED,
        width: { v: 260 * Math.max(...grid.map((row) => row.length)) }
      }
    }
  }
  const block = (blockType: DocumentBlockRangeType): void => {
    const startIndex = body.dataStream.length
    token(T.BLOCK_START)
    body.customBlocks!.push({ blockId: 'drawing-1', startIndex: body.dataStream.length })
    token(T.CUSTOM_BLOCK)
    const rangeStart = body.dataStream.length
    token(T.CUSTOM_RANGE_START)
    const textStart = body.dataStream.length
    token('Evidence')
    ;(body.textRuns ??= []).push({
      st: textStart,
      ed: body.dataStream.length,
      ts: { bl: BooleanNumber.TRUE }
    })
    const rangeEnd = body.dataStream.length
    token(T.CUSTOM_RANGE_END)
    body.customRanges!.push({
      rangeId: 'link-1',
      rangeType: CustomRangeType.HYPERLINK,
      startIndex: rangeStart,
      endIndex: rangeEnd,
      properties: { url: 'https://example.com/evidence' }
    })
    paragraph('block-copy', ' for review')
    token(T.BLOCK_END)
    body.blockRanges!.push({
      blockId: 'block-1',
      blockType,
      startIndex,
      endIndex: body.dataStream.length - 1
    })
  }
  for (const part of parts) {
    if (part === 'table') table()
    else if (part === 'columns' || part === 'nested') {
      const startIndex = body.dataStream.length
      const columns = options?.columns ?? ['column-1', 'column-2']
      token(T.COLUMN_GROUP_START)
      for (const [index, id] of columns.entries()) {
        token(T.COLUMN_START)
        if (part === 'nested' && index === 1) block(DocumentBlockRangeType.CALLOUT)
        else
          paragraph(
            id,
            id === 'column-1' ? 'First column' : id === 'column-2' ? 'Second column' : id
          )
        if (part === 'nested' && index === 0) table()
        token(T.COLUMN_END)
      }
      token(T.COLUMN_GROUP_END)
      body.columnGroups!.push({
        columnGroupId: 'columns-1',
        startIndex,
        endIndex: body.dataStream.length - 1,
        columns: columns.map((id) => ({ columnId: id, widthRatio: 1 }))
      })
    } else if (part === 'quote') block(DocumentBlockRangeType.QUOTE)
    else if (part === 'code') block(DocumentBlockRangeType.CODE)
    else if (part === 'callout') block(DocumentBlockRangeType.CALLOUT)
    else paragraph(part, part)
  }
  section('root-section')
  return data
}

function nestedDocument(tableText: string, columnText: string, idSuffix: string): IDocumentData {
  const tablePrefix = '\x1a\x1b\x1c'
  const tableSuffix = '\n\x1d\x0e\x0f'
  const between = 'Between'
  const columnPrefix = '\x12\x13'
  const columnSuffix = '\x14\x15'
  const after = 'After'
  const tableParagraphEnd = tablePrefix.length + tableText.length
  const tableEnd = tableParagraphEnd + 1 + tableSuffix.length
  const betweenEnd = tableEnd + between.length
  const columnStart = betweenEnd + 1
  const columnParagraphEnd = columnStart + columnPrefix.length + columnText.length
  const columnEnd = columnParagraphEnd + 1 + columnSuffix.length - 1
  const afterEnd = columnEnd + 1 + after.length
  return {
    id: 'doc-nested',
    documentStyle: {},
    body: {
      dataStream: `${tablePrefix}${tableText}\r${tableSuffix}${between}\r${columnPrefix}${columnText}\r${columnSuffix}${after}\r\0`,
      paragraphs: [
        { paragraphId: `table-${idSuffix}`, startIndex: tableParagraphEnd },
        { paragraphId: 'between', startIndex: betweenEnd },
        { paragraphId: `column-${idSuffix}`, startIndex: columnParagraphEnd },
        { paragraphId: 'after', startIndex: afterEnd },
        { paragraphId: 'sentinel', startIndex: afterEnd + 1 }
      ],
      tables: [{ tableId: 'table1', startIndex: 0, endIndex: tableEnd }],
      columnGroups: [{ columnGroupId: 'columns1', startIndex: columnStart, endIndex: columnEnd }]
    }
  }
}
