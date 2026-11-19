import { UniverInstanceType } from '@univerjs/core'
import { expect, it } from 'vitest'
import { decodeComparisonUnitData } from '../../src/gateway-app/comparison-unit-data.ts'

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64')

it('decodes Base table metadata and cell blocks in a pinned comparison', async () => {
  const snapshot = {
    type: UniverInstanceType.UNIVER_BASE,
    unitID: '',
    rev: 0,
    workbook: {
      unitID: 'base',
      rev: 7,
      name: 'Tasks',
      sheetOrder: ['tasks'],
      originalMeta: encode({ createdAt: 123 }),
      sheets: { tasks: { id: 'tasks', name: 'Tasks', originalMeta: { primaryFieldId: 'name' } } },
      blockMeta: { tasks: { blocks: ['first', 'second'] } }
    }
  }
  const blocks = [
    { id: 'first', data: encode({ 0: { 0: { v: 'first task' } } }) },
    { id: 'second', data: { 1: { 0: { v: 'second task' } } } }
  ]
  await expect(decodeComparisonUnitData(snapshot.type, snapshot, blocks)).resolves.toMatchObject({
    id: 'base',
    rev: 7,
    createdAt: 123,
    tables: {
      tasks: {
        primaryFieldId: 'name',
        cellData: { 0: { 0: { v: 'first task' } }, 1: { 0: { v: 'second task' } } }
      }
    }
  })
  await expect(decodeComparisonUnitData(snapshot.type, snapshot, blocks.slice(1))).rejects.toThrow(
    /first/u
  )
})

it.each([
  ['pinned-board', 8, 'pinned-board', 8],
  ['', 0, 'stored-board', 3]
] as const)(
  'decodes Board %j at revision %i with the stored resources',
  async (unitID, rev, expectedId, expectedRev) => {
    const resources = [{ name: 'board-resource', data: '[]' }]
    const board = {
      name: 'Board',
      unitID: 'stored-board',
      rev: 3,
      resources,
      originalMeta: encode({ pageOrder: ['page'], resources: [] })
    }
    const type = UniverInstanceType.UNIVER_BOARD
    await expect(
      decodeComparisonUnitData(type, { type, unitID, rev, board })
    ).resolves.toMatchObject({
      id: expectedId,
      rev: expectedRev,
      pageOrder: ['page'],
      resources
    })
  }
)
