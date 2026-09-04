import {
  UNIT_TYPE_BASE,
  UNIT_TYPE_BOARD,
  UNIT_TYPE_DOC,
  UNIT_TYPE_SHEET,
  UNIT_TYPE_SLIDE
} from './unit-types.js'
import { lazy, Suspense, type ReactElement } from 'react'
import { structuralDiffItemsFromContext } from './comparison-presentation'
import { BaseTableDiffViewer } from './base/base-comparison-view'
import type {
  BaseComparisonViewerValue,
  IUnitComparisonViewerProps,
  NativeComparisonViewerValue,
  SheetComparisonViewerValue
} from './comparison-types'
import { NativeComparisonView } from './native/native-comparison-view'
import {
  UnitComparisonMessagesProvider,
  useUnitComparisonViewerMessages,
  type IUnitComparisonViewerMessages
} from './i18n/messages.js'

const WorkbookDiffViewer = lazy(async () => {
  const module = await import('./sheet/sheet-comparison-view')
  return { default: module.WorkbookDiffViewer }
})

export type {
  IUnitComparisonUniverFactoryOptions,
  IUnitComparisonUniverInstance,
  IUnitComparisonViewerProps,
  IUnitComparisonViewerSide,
  UnitComparisonUniverFactory,
  UnitComparisonViewerValue
} from './comparison-types'

export function UnitComparisonViewer(props: IUnitComparisonViewerProps): ReactElement {
  return (
    <UnitComparisonMessagesProvider
      locale={props.locale}
      {...(props.messages === undefined ? {} : { messages: props.messages })}
    >
      <div
        className="contents"
        data-dark-mode={String(props.darkMode)}
        data-unit-comparison-viewer="true"
      >
        <UnitComparisonViewerContent {...props} />
      </div>
    </UnitComparisonMessagesProvider>
  )
}

function UnitComparisonViewerContent(props: IUnitComparisonViewerProps): ReactElement {
  const { comparison } = props
  const messages = useUnitComparisonViewerMessages()
  switch (comparison.result.unit.type) {
    case UNIT_TYPE_SHEET:
      return renderSheetComparison(props, comparison as SheetComparisonViewerValue, messages)
    case UNIT_TYPE_BASE:
      return renderBaseComparison(props, comparison as BaseComparisonViewerValue, messages)
    case UNIT_TYPE_DOC:
    case UNIT_TYPE_SLIDE:
    case UNIT_TYPE_BOARD:
      return (
        <NativeComparisonView
          comparison={comparison as NativeComparisonViewerValue}
          createUniver={props.createUniver}
          darkMode={props.darkMode}
          leftHeaderControl={props.leftHeaderControl}
          locale={props.locale}
        />
      )
    default:
      throw new Error('Unsupported comparison unit type')
  }
}

function renderSheetComparison(
  props: IUnitComparisonViewerProps,
  comparison: SheetComparisonViewerValue,
  messages: IUnitComparisonViewerMessages
): ReactElement {
  return (
    <div className="min-h-0 flex-1 overflow-hidden p-2">
      <Suspense fallback={<div className="h-full" />}>
        <WorkbookDiffViewer
          createUniver={props.createUniver}
          darkMode={props.darkMode}
          leftSourceControl={props.leftHeaderControl}
          locale={props.locale}
          unitLabel={comparison.result.unit.name}
          compare={{
            leftLabel: comparisonSideLabel(comparison.left, messages.revision),
            leftWorkbookData: comparison.left.unitData,
            rightLabel: comparisonSideLabel(comparison.right, messages.revision),
            rightWorkbookData: comparison.right.unitData,
            context: comparison.result,
            ...(comparison.result.fidelity === 'snapshot'
              ? { degradedReason: messages.comparingMaterializedSnapshots }
              : {})
          }}
        />
      </Suspense>
    </div>
  )
}

function renderBaseComparison(
  props: IUnitComparisonViewerProps,
  comparison: BaseComparisonViewerValue,
  messages: IUnitComparisonViewerMessages
): ReactElement {
  return (
    <BaseTableDiffViewer
      fidelity={comparison.result.fidelity}
      items={structuralDiffItemsFromContext(comparison.result)}
      left={comparison.left.unitData}
      leftLabel={comparisonSideLabel(comparison.left, messages.revision)}
      leftSourceControl={props.leftHeaderControl}
      right={comparison.right.unitData}
      rightLabel={comparisonSideLabel(comparison.right, messages.revision)}
    />
  )
}

function comparisonSideLabel(
  side: { readonly label: string; readonly revision?: number },
  revisionLabel: (revision: number) => string
): string {
  return side.revision === undefined
    ? side.label
    : `${side.label} · ${revisionLabel(side.revision)}`
}
