import { describe, expect, it } from 'vitest'
import {
  buildBaseDiffGridLayout,
  buildBaseTableDiff,
  getBaseDiffCell,
  formatBaseCellValue,
  baseDiffFieldLabel
} from '../src/base/base-table-diff'
import type { UnitStructuralDiffItem } from '../src/shared/structural-diff.js'

function baseChange(
  entityType: string,
  stableId: string,
  kind: 'insert' | 'delete' | 'update',
  tableId = 't1'
): UnitStructuralDiffItem {
  return {
    id: `${entityType}:${stableId}`,
    stableId,
    entityType,
    category: entityType,
    parentStableId: tableId,
    path: [entityType, tableId, stableId],
    label: stableId,
    kind,
    moved: false,
    changes: [],
    position: { left: null, right: null },
    values: {}
  }
}

describe('stable-ID Unit structural diff', () => {
  it('renders Base dates, configured currency, and structured links as readable values', () => {
    expect(formatBaseCellValue(44927, { type: 'date', config: { pattern: 'yyyy-mm-dd' } })).toBe(
      '2023-01-01'
    )
    expect(
      formatBaseCellValue(1234.5, {
        type: 'currency',
        config: { currencySymbol: '€', decimalPlaces: 2, separatorStyle: 'periodComma' }
      })
    ).toBe('€1.234,50')
    expect(
      formatBaseCellValue({ text: 'Runbook', url: 'https://example.com/runbook' }, { type: 'link' })
    ).toBe('Runbook')
    expect(formatBaseCellValue(null, { type: 'currency' })).toBe('')
    expect(formatBaseCellValue('', { type: 'number' })).toBe('')
  })

  it('keeps renamed Base field headers specific to each comparison side', () => {
    const field = {
      id: 'f',
      left: { name: 'Planned budget' },
      right: { name: 'Approved budget' },
      label: 'Approved budget',
      status: 'update' as const
    }
    expect(baseDiffFieldLabel(field, 'left')).toBe('Planned budget')
    expect(baseDiffFieldLabel(field, 'right')).toBe('Approved budget')
  })

  it('aligns Base raw fields and records by stable ID and ignores view-only changes', () => {
    const left = {
      tableOrder: ['t1'],
      tables: {
        t1: {
          id: 't1',
          name: 'Tasks',
          primaryFieldId: 'title',
          fieldOrder: ['title', 'owner'],
          fields: {
            title: { id: 'title', name: 'Title', type: 'text', config: {} },
            owner: { id: 'owner', name: 'Owner', type: 'text', config: {} }
          },
          recordOrder: ['r1', 'r-deleted'],
          records: {
            r1: { id: 'r1', values: { title: 'Alpha', owner: 'Mina' } },
            'r-deleted': { id: 'r-deleted', values: { title: 'Legacy' } }
          },
          viewOrder: ['grid'],
          views: { grid: { id: 'grid', name: 'Grid', fieldOrder: ['title'] } }
        }
      }
    }
    const right = {
      tableOrder: ['t1'],
      tables: {
        t1: {
          id: 't1',
          name: 'Tasks',
          primaryFieldId: 'title',
          fieldOrder: ['title', 'risk', 'owner'],
          fields: {
            title: { id: 'title', name: 'Title', type: 'text', config: {} },
            risk: { id: 'risk', name: 'Risk', type: 'text', config: {} },
            owner: { id: 'owner', name: 'Owner', type: 'text', config: {} }
          },
          recordOrder: ['r1', 'r-inserted'],
          records: {
            r1: { id: 'r1', values: { title: 'ALPHA', owner: 'Mina', risk: 'High' } },
            'r-inserted': { id: 'r-inserted', values: { title: 'New' } }
          },
          viewOrder: ['kanban'],
          views: { kanban: { id: 'kanban', name: 'Board', fieldOrder: ['owner'] } }
        }
      }
    }

    const [table] = buildBaseTableDiff(left, right, [
      baseChange('cell', 'r1:title', 'update'),
      baseChange('cell', 'r1:risk', 'insert'),
      baseChange('field', 'risk', 'insert'),
      baseChange('record', 'r-deleted', 'delete'),
      baseChange('record', 'r-inserted', 'insert')
    ])
    expect(table?.fields.map((field) => field.id)).toEqual(['title', 'risk', 'owner'])
    expect(table?.records.map((record) => record.id)).toEqual(['r1', 'r-deleted', 'r-inserted'])
    const title = table?.fields.find((field) => field.id === 'title')
    const risk = table?.fields.find((field) => field.id === 'risk')
    const r1 = table?.records.find((record) => record.id === 'r1')
    expect(title).toBeDefined()
    expect(risk).toBeDefined()
    expect(r1).toBeDefined()
    expect(getBaseDiffCell({ field: title!, record: r1!, side: 'left' })).toMatchObject({
      displayValue: 'Alpha',
      status: 'update'
    })
    expect(getBaseDiffCell({ field: title!, record: r1!, side: 'right' })).toMatchObject({
      displayValue: 'ALPHA',
      status: 'update'
    })
    expect(getBaseDiffCell({ field: risk!, record: r1!, side: 'left' })).toMatchObject({
      displayValue: '',
      present: false,
      status: 'delete'
    })
    expect(getBaseDiffCell({ field: risk!, record: r1!, side: 'right' })).toMatchObject({
      displayValue: 'High',
      present: true,
      status: 'insert'
    })

    const viewOnlyRight = structuredClone(left)
    viewOnlyRight.tables.t1.views.grid.name = 'Renamed view'
    expect(buildBaseTableDiff(left, viewOnlyRight, [])).toEqual([])
    expect(buildBaseTableDiff(left, right, [])).toEqual([])
    const [viewChange] = buildBaseTableDiff(left, viewOnlyRight, [
      baseChange('view', 'grid', 'update')
    ])
    expect(viewChange?.status).toBe('update')
    expect(viewChange?.records.every((record) => record.cellChanges.size === 0)).toBe(true)
  })

  it('uses one explicit Base grid geometry for both panes and hides internal record IDs', () => {
    const snapshot = (width: number) => ({
      tableOrder: ['tasks'],
      tables: {
        tasks: {
          id: 'tasks',
          name: 'Tasks',
          primaryFieldId: 'title',
          fieldOrder: ['record-id', 'title'],
          fields: {
            'record-id': {
              id: 'record-id',
              name: 'Record ID',
              type: 'recordId',
              system: true
            },
            title: { id: 'title', name: 'Title', type: 'text' }
          },
          recordOrder: ['r1'],
          records: {
            r1: { id: 'r1', values: { title: width > 200 ? 'Launch updated' : 'Launch' } }
          },
          viewOrder: ['grid'],
          views: {
            grid: {
              id: 'grid',
              type: 'grid',
              fieldSettings: { title: { width } }
            }
          }
        }
      }
    })
    const [diff] = buildBaseTableDiff(snapshot(120), snapshot(236), [
      baseChange('cell', 'r1:title', 'update', 'tasks')
    ])

    expect(diff?.fields.map((field) => field.id)).toEqual(['title'])
    expect(buildBaseDiffGridLayout(diff!)).toEqual({
      columnWidths: [236],
      gridTemplateColumns: '44px 236px',
      totalWidth: 280
    })
  })
})
