import { describe, expect, it } from 'vitest'
import { CellValueType, HorizontalAlign, LocaleType, WrapStrategy } from '@univerjs/core'
import {
  UNIT_COMPARISON_VIEWER_LOCALES,
  resolveUnitComparisonViewerMessages
} from '../src/i18n/locale-registry.js'
import { formatComparisonValue } from '../src/shared/comparison-value.js'
import { structuralDiffItemLabel } from '../src/shared/structural-diff-item-label.js'

describe('UnitComparisonViewer localization', () => {
  it('owns one complete message pack for every supported application locale', () => {
    expect(UNIT_COMPARISON_VIEWER_LOCALES).toHaveLength(17)
    expect(new Set(UNIT_COMPARISON_VIEWER_LOCALES).size).toBe(17)
    const english = resolveUnitComparisonViewerMessages(LocaleType.EN_US)
    const authority = shapeOf(english)

    for (const locale of UNIT_COMPARISON_VIEWER_LOCALES) {
      const messages = resolveUnitComparisonViewerMessages(locale)
      expect(shapeOf(messages), locale).toEqual(authority)
      expect(messages.showFormulas, `${locale}:showFormulas`).toBeTruthy()
      expect(messages.entity('paragraph'), `${locale}:paragraph`).not.toBe('paragraph')
      expect(messages.entityAt('paragraph', 3), `${locale}:entityAt`).toContain(
        messages.entity('paragraph')
      )
      if (locale !== LocaleType.EN_US) {
        expect(messages.showFormulas, locale).not.toBe(english.showFormulas)
        expect(messages.baseAlignmentHint, locale).not.toContain('stable ID')
      }
    }
  })

  it('falls back to English and deep-merges host wording overrides', () => {
    expect(resolveUnitComparisonViewerMessages('ar-SA' as LocaleType).workbookTitle).toBe(
      'Workbook comparison'
    )
    const chinese = resolveUnitComparisonViewerMessages(LocaleType.ZH_CN, {
      sheetTree: { titles: { sheetRenamed: '自定义重命名' } }
    })
    expect(chinese.sheetTree.titles.sheetRenamed).toBe('自定义重命名')
    expect(chinese.sheetTree.titles.workbookRenamed).toBe('工作簿已重命名')
    expect(chinese.sheetTree.categories.cell).toBe('单元格')
  })

  it('translates representative five-product paths in every locale', () => {
    const representativePaths = [
      'value',
      'formula',
      'style',
      'paragraphStyle',
      'sectionId',
      'tableCells',
      'shapeType',
      'masterPageId',
      'connectorData',
      'fieldOrder',
      'routingMode',
      'geometry',
      'text',
      'title'
    ]
    for (const locale of UNIT_COMPARISON_VIEWER_LOCALES) {
      const messages = resolveUnitComparisonViewerMessages(locale)
      for (const key of representativePaths) {
        expect(messages.changePath([key]), `${locale}:${key}`).not.toBe(key)
      }
    }
  })

  it('translates SDK-owned types, operators, formatting, and product enums', () => {
    for (const locale of UNIT_COMPARISON_VIEWER_LOCALES) {
      const messages = resolveUnitComparisonViewerMessages(locale)
      const cases = [
        ['cell', ['valueType'], CellValueType.NUMBER, 'numberType'],
        ['cell', ['valueType'], String(CellValueType.NUMBER), 'numberType'],
        ['cell', ['style', 'ht'], HorizontalAlign.CENTER, 'center'],
        ['cell', ['style', 'tb'], WrapStrategy.WRAP, 'wrap'],
        ['condition-format', ['rule', 'operator'], 'between', 'between'],
        ['condition-format', ['rule', 'type'], 'highlightCell', 'highlightCell'],
        ['table', ['columns', '0', 'dataType'], 'string', 'textType'],
        ['field', ['type'], 'text', 'textType'],
        ['view', ['type'], 'calendar', 'calendar'],
        ['block-range', ['type'], 'callout', 'callout'],
        ['doc-latex', ['kind'], 'inline', 'inline'],
        ['slide-transition', ['type'], 'wipe', 'wipe'],
        ['board-element', ['shapeData', 'shapeType'], 'rect', 'rectangle'],
        ['board-element', ['connectorData', 'routingMode'], 'manual', 'manual']
      ] as const
      for (const [entity, path, value, term] of cases) {
        const localized = messages.changeValue(entity, path, value)
        expect(localized, `${locale}:${entity}:${path.join('.')}:${term}`).toBeTruthy()
        expect(localized, `${locale}:${entity}:${path.join('.')}:${term}`).not.toBe(String(value))
      }
    }
  })

  it('translates schema values without changing user content', () => {
    const messages = resolveUnitComparisonViewerMessages(LocaleType.ZH_CN)
    expect(
      formatComparisonValue('2', 'unknown', { entityType: 'cell', path: ['valueType'] }, messages)
    ).toBe('数字')
    expect(
      formatComparisonValue(
        'between',
        'text',
        { entityType: 'condition-format', path: ['rule', 'operator'] },
        messages
      )
    ).toBe('介于')
    expect(messages.changePath(['columns', '0', 'dataType'])).toBe('列 · 项目 1 · 数据类型')
    expect(messages.changePath([])).toBe('项目')
    expect(messages.changePath(['futurePluginProperty'])).toBe('其他属性')
    expect(
      messages.changeValue('table', ['columns', '0', 'displayName'], 'sheets-table.columnPrefix 7')
    ).toBe('第 7 列')

    for (const value of ['between', 'rect', 'true', '2', '=SUM(A1:A4)', '{"type":"number"}']) {
      expect(
        formatComparisonValue(value, 'text', { entityType: 'paragraph', path: ['text'] }, messages)
      ).toBe(value)
    }
    expect(messages.changeValue('cell', ['valueType'], 999)).toBeUndefined()
  })

  it('formats readable sidebar values with the selected locale', () => {
    const english = resolveUnitComparisonViewerMessages(LocaleType.EN_US)
    expect(
      formatComparisonValue(
        { id: 'opaque-id', language: 'typescript' },
        'unknown',
        undefined,
        english
      )
    ).toBe('2 properties')
    expect(formatComparisonValue('[1,2]', 'object', undefined, english)).toBe('2 items')
    expect(formatComparisonValue('[1,2]', 'text', undefined, english)).toBe('[1,2]')
    expect(formatComparisonValue({ rgb: '#ff0000' }, 'unknown', undefined, english)).toBe('#ff0000')
    expect(formatComparisonValue(undefined, 'unknown', undefined, english)).toBe('∅')
    expect(formatComparisonValue(false, 'boolean', undefined, english)).toBe('Unchecked')

    const chinese = resolveUnitComparisonViewerMessages(LocaleType.ZH_CN)
    expect(formatComparisonValue(false, 'boolean', undefined, chinese)).toBe('未勾选')
    expect(formatComparisonValue([1, 2], 'unknown', undefined, chinese)).toBe('2 项')
  })

  it('keeps stable IDs out of localized structural labels', () => {
    const messages = resolveUnitComparisonViewerMessages(LocaleType.ZH_CN)
    const label = structuralDiffItemLabel(
      {
        id: 'board-element:update:element-opaque-id',
        stableId: 'element-opaque-id',
        category: 'board-element',
        entityType: 'board-element',
        path: ['board-element', 'element-opaque-id'],
        label: 'element-opaque-id',
        kind: 'update',
        moved: true,
        changes: [],
        position: { left: 1, right: 2 },
        values: { left: {}, right: {} }
      },
      undefined,
      messages
    )

    expect(label).toBe(`${messages.entityAt('board-element', 3)} · ${messages.moved}`)
    expect(label).not.toContain('element-opaque-id')
  })

  it('uses localized Doc block semantics instead of internal range IDs', () => {
    const messages = resolveUnitComparisonViewerMessages(LocaleType.ZH_CN)
    const label = structuralDiffItemLabel(
      {
        id: 'block-range:update:opaque-quote-id',
        stableId: 'opaque-quote-id',
        category: 'block-range',
        entityType: 'block-range',
        path: ['block-range', 'opaque-quote-id'],
        label: '发布前需要完成安全审查',
        kind: 'update',
        moved: false,
        changes: [
          {
            path: ['type'],
            kind: 'update',
            valueType: 'text',
            before: 'callout',
            after: 'quote'
          }
        ],
        position: { left: 1, right: 1 },
        values: { left: { type: 'callout' }, right: { type: 'quote' } }
      },
      undefined,
      messages
    )

    expect(label).toBe(
      `${messages.changeValue('block-range', ['type'], 'quote')} · 发布前需要完成安全审查`
    )
    expect(label).not.toContain('opaque-quote-id')
  })

  it('localizes a Slide transition reference without displaying its target ID', () => {
    const messages = resolveUnitComparisonViewerMessages(LocaleType.ZH_CN)
    const item = {
      id: 'slide-transition-ref:update:slide-1',
      stableId: 'slide-1',
      category: 'slide-transition-ref',
      entityType: 'slide-transition-ref',
      path: ['slide-transition-ref', 'slide-1'],
      label: 'transition-private-id',
      kind: 'update' as const,
      moved: false,
      changes: [],
      position: { left: 0, right: 0 },
      values: { left: 'transition-old-id', right: 'transition-private-id' }
    }

    expect(structuralDiffItemLabel(item, undefined, messages)).toBe(
      messages.entityAt('slide-transition-ref', 1)
    )
    expect(structuralDiffItemLabel(item, 'Launch overview', messages)).toBe('Launch overview')
    expect(item.values.right).toBe('transition-private-id')
  })
})

function shapeOf(value: unknown): unknown {
  if (typeof value === 'function') return 'fn'
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, shapeOf(child)])
    )
  }
  return typeof value
}
