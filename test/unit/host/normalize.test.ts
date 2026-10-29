import { describe, expect, it } from 'vitest'
import { stripGatewaySuccessEnvelope } from '../../../src/host/tools/normalize.ts'
import { unitContentKind } from '../../../src/shared/unit-content-session.ts'

describe('stripGatewaySuccessEnvelope', () => {
  const operation = (result: unknown) =>
    ({ ok: true, operation: 'worktree', file: '/a.univer', result }) as never

  // `code: 1` is ErrorCode.OK in the Gateway wire contract.
  it('drops the success envelope and keeps the meaningful fields', () => {
    expect(
      stripGatewaySuccessEnvelope(
        operation({ error: { code: 1, message: '' }, worktreeId: 'wt-1' })
      )
    ).toEqual({
      ok: true,
      operation: 'worktree',
      file: '/a.univer',
      result: { worktreeId: 'wt-1' }
    })
  })

  it.each([
    ['a failure envelope', { error: { code: 0, message: 'failed' } }],
    ['no envelope', { worktreeId: 'wt-1' }],
    ['a non-record result', ['wt-1']]
  ])('leaves %s untouched', (_label, result) => {
    const value = operation(result)
    expect(stripGatewaySuccessEnvelope(value)).toBe(value)
  })
})

describe('unitContentKind', () => {
  it.each([
    [1, 'doc'],
    [2, 'sheet'],
    [3, 'slide'],
    [5, 'base'],
    [6, 'board']
  ] as const)('maps UniverInstanceType %i to %s', (type, kind) => {
    expect(unitContentKind(type)).toBe(kind)
  })

  it('rejects an unsupported type with a stable code', () => {
    expect(() => unitContentKind(4)).toThrow(
      expect.objectContaining({ code: 'UNIT_CONTENT_TYPE_UNSUPPORTED' })
    )
  })
})
