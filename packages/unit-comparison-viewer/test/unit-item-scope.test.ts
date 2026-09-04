import { describe, expect, it } from 'vitest'
import {
  baseTableIdOfDiffItem,
  filterBaseTableDiffItems,
  filterSlidePageDiffItems,
  slidePageIdOfDiffItem,
  type UnitStructuralDiffItem
} from '../src/shared/structural-diff.js'

describe('Unit structural diff scopes', () => {
  it('scopes Slide page and element changes by stable page identity', () => {
    const page = diffItem('slide', 'page-1')
    const shape = diffItem('slide-element', 'shape-1', 'page-1')
    const other = diffItem('slide-element', 'shape-2', 'page-2')

    expect(slidePageIdOfDiffItem(page)).toBe('page-1')
    expect(slidePageIdOfDiffItem(shape)).toBe('page-1')
    expect(filterSlidePageDiffItems([page, shape, other], 'page-1')).toEqual([page, shape])
  })

  it('scopes Base table and child changes by stable table identity', () => {
    const table = diffItem('table', 'table-1')
    const field = diffItem('field', 'field-1', 'table-1')
    const record = diffItem('record', 'record-2', 'table-2')

    expect(baseTableIdOfDiffItem(table)).toBe('table-1')
    expect(baseTableIdOfDiffItem(field)).toBe('table-1')
    expect(filterBaseTableDiffItems([table, field, record], 'table-1')).toEqual([table, field])
  })

  it('keeps legacy category parent IDs as a compatibility fallback', () => {
    const slideElement = { ...diffItem('slide-element', 'shape'), category: 'slide-element:page' }
    const baseCell = { ...diffItem('cell', 'record:field'), category: 'cell:table' }

    expect(slidePageIdOfDiffItem(slideElement)).toBe('page')
    expect(baseTableIdOfDiffItem(baseCell)).toBe('table')
  })

  it('prefers the SDK-owned scope over inferred parent metadata', () => {
    const slideElement = {
      ...diffItem('slide-element', 'shape', 'legacy-page'),
      scope: { entityType: 'slide', stableId: 'sdk-page' }
    }
    const baseCell = {
      ...diffItem('cell', 'record:field', 'legacy-table'),
      scope: { entityType: 'table', stableId: 'sdk-table' }
    }

    expect(slidePageIdOfDiffItem(slideElement)).toBe('sdk-page')
    expect(baseTableIdOfDiffItem(baseCell)).toBe('sdk-table')
  })
})

function diffItem(
  entityType: string,
  stableId: string,
  parentStableId?: string
): UnitStructuralDiffItem {
  return {
    id: `${entityType}:${stableId}`,
    stableId,
    category: parentStableId === undefined ? entityType : `${entityType}:${parentStableId}`,
    entityType,
    ...(parentStableId === undefined ? {} : { parentStableId }),
    path: [],
    label: stableId,
    kind: 'update',
    moved: false,
    changes: [],
    position: { left: null, right: null },
    values: {}
  }
}
