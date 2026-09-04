import {
  CommandType,
  CustomCommandExecutionError,
  type ICommandService,
  type IPermissionService
} from '@univerjs/core'
import {
  WorkbookCreateProtectPermission,
  WorkbookEditablePermission,
  WorkbookPrintPermission
} from '@univerjs/sheets'
import type { UnitType } from '@univer/collab-gateway-contract'
import { UNIT_TYPE_BOARD, UNIT_TYPE_SHEET } from '@univer/collab-gateway-contract'

type ViewerReadOnlyEnforcement = 'none' | 'sheet-permission' | 'mutation-gate'
export type ViewerWorkbenchChrome = 'hidden' | 'visible'

/** Show editing chrome only where its actions match the scope's actual capabilities. */
export function resolveViewerWorkbenchChrome(
  unitType: UnitType,
  editable: boolean
): ViewerWorkbenchChrome {
  if (unitType === UNIT_TYPE_SHEET) {
    return 'visible'
  }
  if (unitType === UNIT_TYPE_BOARD) {
    return 'hidden'
  }
  return editable ? 'visible' : 'hidden'
}

/** Resolve read-only enforcement from scope-owned editability, never from a Unit allowlist. */
export function resolveViewerReadOnlyEnforcement(
  unitType: UnitType,
  editable: boolean
): ViewerReadOnlyEnforcement {
  if (editable) {
    return 'none'
  }
  return unitType === UNIT_TYPE_SHEET ? 'sheet-permission' : 'mutation-gate'
}

/** Disable Sheet actions whose Ribbon state is governed by dedicated workbook permissions. */
export function enforceSheetViewerReadOnlyPermissions(
  permissionService: Pick<
    IPermissionService,
    'addPermissionPoint' | 'getPermissionPoint' | 'updatePermissionPoint'
  >,
  unitId: string
): void {
  const points = [
    new WorkbookEditablePermission(unitId),
    new WorkbookCreateProtectPermission(unitId),
    new WorkbookPrintPermission(unitId)
  ]
  for (const point of points) {
    if (!permissionService.getPermissionPoint(point.id)) {
      permissionService.addPermissionPoint(point)
    }
    permissionService.updatePermissionPoint(point.id, false)
  }
}

/** Keep a viewer navigable while accepting model changes that stay outside collaboration submit. */
export function blockLocalEditingCommands(
  commandService: Pick<ICommandService, 'beforeCommandExecuted'>
): void {
  commandService.beforeCommandExecuted((commandInfo, options) => {
    if (
      commandInfo.type === CommandType.MUTATION &&
      options?.fromCollab !== true &&
      options?.onlyLocal !== true
    ) {
      throw new CustomCommandExecutionError('viewer is read-only')
    }
  })
}
