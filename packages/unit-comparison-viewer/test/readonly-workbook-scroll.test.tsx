import type { MutableRefObject } from 'react'
import type { Univer } from '@univerjs/core'
import { SetScrollOperation } from '@univerjs/sheets-ui'
import { describe, expect, it } from 'vitest'
import { applyControlledScroll } from '../src/sheet/readonly-workbook-pane.js'

const scroll = {
  key: 'peer-scroll',
  offsetX: 4,
  offsetY: 18,
  sheetId: 'sheet-1',
  sheetViewStartColumn: 1,
  sheetViewStartRow: 2,
  sourceRole: 'base' as const
}

describe('applyControlledScroll', () => {
  it('does not execute set-scroll until the sheet scroll service is registered', () => {
    let scrollServiceReady = false
    const commands: Array<{ id: string; unitId: string; offsetY: number }> = []
    const appliedKey = ref<string | null>(null)
    const emittedKey = ref<string | null>(null)
    const univer = fakeUniver({
      isScrollServiceReady: () => scrollServiceReady,
      onCommand: (command) => {
        commands.push(command)
      }
    })

    expect(
      applyControlledScroll({
        controlledScroll: scroll,
        currentWorkbookId: 'book-1',
        lastAppliedScrollKeyRef: appliedKey,
        lastEmittedScrollKeyRef: emittedKey,
        univer
      })
    ).toBe(false)
    expect(commands).toEqual([])
    expect(appliedKey.current).toBeNull()

    scrollServiceReady = true
    expect(
      applyControlledScroll({
        controlledScroll: scroll,
        currentWorkbookId: 'book-1',
        lastAppliedScrollKeyRef: appliedKey,
        lastEmittedScrollKeyRef: emittedKey,
        univer
      })
    ).toBe(true)
    expect(commands).toEqual([{ id: SetScrollOperation.id, unitId: 'book-1', offsetY: 18 }])
    expect(appliedKey.current).toBe('peer-scroll')

    expect(
      applyControlledScroll({
        controlledScroll: scroll,
        currentWorkbookId: 'book-1',
        lastAppliedScrollKeyRef: appliedKey,
        lastEmittedScrollKeyRef: emittedKey,
        univer
      })
    ).toBe(true)
    expect(commands).toHaveLength(1)
  })
})

function ref<T>(value: T): MutableRefObject<T> {
  return { current: value }
}

function fakeUniver(input: {
  readonly isScrollServiceReady: () => boolean
  readonly onCommand: (command: { id: string; unitId: string; offsetY: number }) => void
}): Univer {
  const render = {
    with(token: unknown) {
      if (typeof token !== 'function' || token.name !== 'SheetScrollManagerService') {
        throw new Error('unexpected render dependency')
      }
      if (!input.isScrollServiceReady()) {
        throw new Error(
          '[redi]: Cannot find "SheetScrollManagerService" registered by any injector'
        )
      }
      return {}
    }
  }
  const injector = {
    get(token: unknown) {
      const id = String(token)
      if (id === 'engine-render.render-manager.service') {
        return { getRenderUnitById: () => render }
      }
      if (id === 'univer.core.command-service') {
        return {
          syncExecuteCommand: (
            commandId: string,
            params: { unitId?: string; offsetY?: number } | undefined
          ) => {
            if (!input.isScrollServiceReady()) {
              throw new Error(
                '[redi]: Cannot find "SheetScrollManagerService" registered by any injector'
              )
            }
            input.onCommand({
              id: commandId,
              unitId: params?.unitId ?? '',
              offsetY: params?.offsetY ?? 0
            })
            return true
          }
        }
      }
      throw new Error(`unexpected dependency: ${id}`)
    }
  }
  return {
    __getInjector: () => injector
  } as unknown as Univer
}
