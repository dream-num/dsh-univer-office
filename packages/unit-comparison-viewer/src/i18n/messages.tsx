import { createContext, useContext, useMemo, type ReactElement, type ReactNode } from 'react'
import { LocaleType } from '@univerjs/core'
import {
  enUSUnitComparisonViewerMessages,
  resolveUnitComparisonViewerMessages
} from './locale-registry.js'
import type {
  IUnitComparisonViewerMessages,
  UnitComparisonViewerMessageOverrides
} from './types.js'

export type {
  IUnitComparisonViewerMessages,
  UnitComparisonViewerMessageOverrides
} from './types.js'
export { resolveUnitComparisonViewerMessages } from './locale-registry.js'

export const defaultUnitComparisonViewerMessages = enUSUnitComparisonViewerMessages

const UnitComparisonMessagesContext = createContext(defaultUnitComparisonViewerMessages)

export function UnitComparisonMessagesProvider(input: {
  readonly children: ReactNode
  readonly locale?: LocaleType
  readonly messages?: UnitComparisonViewerMessageOverrides
}): ReactElement {
  const messages = useMemo(
    () => resolveUnitComparisonViewerMessages(input.locale ?? LocaleType.EN_US, input.messages),
    [input.locale, input.messages]
  )
  return (
    <UnitComparisonMessagesContext.Provider value={messages}>
      {input.children}
    </UnitComparisonMessagesContext.Provider>
  )
}

export function useUnitComparisonViewerMessages(): IUnitComparisonViewerMessages {
  return useContext(UnitComparisonMessagesContext)
}
