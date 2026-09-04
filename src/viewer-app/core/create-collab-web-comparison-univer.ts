import { ICommandService, Univer, UniverInstanceType } from '@univerjs/core'
import {
  UNIT_TYPE_BASE,
  UNIT_TYPE_BOARD,
  UNIT_TYPE_DOC,
  UNIT_TYPE_SHEET,
  UNIT_TYPE_SLIDE,
  type UnitType
} from '@univer/collab-gateway-contract'
import { CollaborationController } from '@univerjs-pro/collaboration-client'
import { EMPTY } from 'rxjs'
import type {
  IUnitComparisonUniverInstance,
  UnitComparisonUniverFactory
} from '@univer/unit-comparison-viewer'
import { loadViewerLocale } from './locales/generated/load'
import { blockLocalEditingCommands } from './viewer-readonly'

export const createCollabWebComparisonUniver: UnitComparisonUniverFactory = async (
  options
): Promise<IUnitComparisonUniverInstance> => {
  const [localePack, renderPreset] = await Promise.all([
    loadViewerLocale(options.locale),
    import('@univer/render-preset'),
    import('@univer/render-preset/facades')
  ])
  const univer = new Univer({
    locale: options.locale,
    locales: { [options.locale]: localePack },
    darkMode: options.darkMode
  })

  try {
    options.container.id ||= `comparison-pane-${Math.random().toString(36).slice(2)}`
    renderPreset.registerViewRendering(univer, {
      container: options.container.id,
      assetIoOwner: renderPreset.ViewAssetIoOwner.Local,
      license: renderPreset.TEST_LICENSE,
      workbenchChrome: 'hidden',
      sheetTableUI: { hideAnchor: true },
      unitType: toUniverInstanceType(options.unitType)
    })

    const injector = univer.__getInjector()
    if (!injector.has(CollaborationController)) {
      injector.add([
        CollaborationController,
        { useValue: { entityInit$: EMPTY } as unknown as CollaborationController }
      ])
    }
    blockLocalEditingCommands(injector.get(ICommandService))

    let disposed = false
    return {
      univer,
      dispose: () => {
        if (disposed) return
        disposed = true
        univer.dispose()
      }
    }
  } catch (error) {
    univer.dispose()
    throw error
  }
}

function toUniverInstanceType(unitType: UnitType): UniverInstanceType {
  switch (unitType) {
    case UNIT_TYPE_SHEET:
      return UniverInstanceType.UNIVER_SHEET
    case UNIT_TYPE_DOC:
      return UniverInstanceType.UNIVER_DOC
    case UNIT_TYPE_SLIDE:
      return UniverInstanceType.UNIVER_SLIDE
    case UNIT_TYPE_BASE:
      return UniverInstanceType.UNIVER_BASE
    case UNIT_TYPE_BOARD:
      return UniverInstanceType.UNIVER_BOARD
    default:
      throw new Error(`Unsupported comparison unit type: ${String(unitType)}`)
  }
}
