import { describe, expect, it } from 'vitest'
import { fileAddressBasename, parseFileAddress } from '../../../src/client/resource-address.ts'

describe('parseFileAddress', () => {
  it.each([
    [
      'dsh-resource://file/session/s1/src/a.univer',
      { scope: 'session', sessionId: 's1', path: 'src/a.univer' }
    ],
    [
      'dsh-resource://file/session/s%201/a%20b.univer?line=3#frag',
      { scope: 'session', sessionId: 's 1', path: 'a b.univer' }
    ],
    [
      'dsh-resource://file/absolute/home/me/a.univer',
      { scope: 'absolute', path: '/home/me/a.univer' }
    ],
    [
      'dsh-resource://file/absolute/C:/dir/a.univer',
      { scope: 'absolute', path: 'C:/dir/a.univer' }
    ],
    [
      'dsh-resource://file/absolute//server/share/a.univer',
      { scope: 'absolute', path: '//server/share/a.univer' }
    ]
  ])('parses %s', (address, parsed) => {
    expect(parseFileAddress(address)).toEqual(parsed)
  })

  it.each([
    'dsh-resource://note/session/s1/a.univer',
    'dsh-resource://file/session/s1',
    'dsh-resource://file/session//a.univer',
    'dsh-resource://file/absolute/',
    'dsh-resource://file/other/a.univer',
    'dsh-resource://file/session/s1/%ZZ.univer',
    '/plain/path/a.univer'
  ])('rejects %s', (address) => {
    expect(parseFileAddress(address)).toBeUndefined()
  })
})

describe('fileAddressBasename', () => {
  it('decodes the last path segment', () => {
    expect(fileAddressBasename('dsh-resource://file/session/s1/%E6%9C%88%E5%BA%A6.univer')).toBe(
      '月度.univer'
    )
  })

  it('falls back to the last segment of an unparsed string', () => {
    expect(fileAddressBasename('sidebar://guide')).toBe('guide')
  })
})
