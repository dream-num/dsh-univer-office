import {
  CommandType,
  CustomCommandExecutionError,
  DOCS_NORMAL_EDITOR_UNIT_ID_KEY,
  DOCS_FORMULA_BAR_EDITOR_UNIT_ID_KEY
} from '@univerjs/core'
import type { ICommandService, IPermissionService } from '@univerjs/core'
import { WorkbookCreateProtectPermission, WorkbookEditablePermission } from '@univerjs/sheets'
import type { SheetPermissionCheckController } from '@univerjs/sheets'
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
    | 'addPermissionPoint'
    | 'getPermissionPoint'
    | 'updatePermissionPoint'
    | 'setShowComponents'
    | 'permissionPointUpdate$'
  >,
  unitId: string
): () => void {
  // The shell owns read-only mode and its Continue editing action. Native protection
  // dialogs incorrectly tell users to contact a document owner for permission.
  permissionService.setShowComponents(false)
  const points = [
    new WorkbookEditablePermission(unitId),
    new WorkbookCreateProtectPermission(unitId)
  ]
  for (const point of points) {
    if (!permissionService.getPermissionPoint(point.id)) {
      permissionService.addPermissionPoint(point)
    }
    permissionService.updatePermissionPoint(point.id, false)
  }
  // A late authz refresh must not lift this instance's read-only mode.
  const ids = new Set(points.map((point) => point.id))
  const subscription = permissionService.permissionPointUpdate$.subscribe((point) => {
    if (ids.has(point.id) && point.value !== false) {
      permissionService.updatePermissionPoint(point.id, false)
    }
  })
  return () => subscription.unsubscribe()
}

/** Keep a viewer navigable while accepting model changes that stay outside collaboration submit. */
export function blockLocalEditingCommands(
  commandService: Pick<ICommandService, 'beforeCommandExecuted'>,
  onBlocked?: () => void
): void {
  commandService.beforeCommandExecuted((commandInfo, options) => {
    const params = commandInfo.params
    // Sheet uses internal Docs models for formula text and clipboard staging. These
    // are not document changes and never belong to a collaboration Unit.
    if (
      params &&
      typeof params === 'object' &&
      'unitId' in params &&
      (params.unitId === DOCS_NORMAL_EDITOR_UNIT_ID_KEY ||
        params.unitId === DOCS_FORMULA_BAR_EDITOR_UNIT_ID_KEY)
    )
      return
    if (
      commandInfo.type === CommandType.MUTATION &&
      options?.fromCollab !== true &&
      options?.onlyLocal !== true
    ) {
      onBlocked?.()
      throw new CustomCommandExecutionError('viewer is read-only')
    }
  })
}

/** Explain editing attempts without intercepting selection, navigation, copy, or browser shortcuts. */
export function installSheetReadOnlyFeedback(
  container: HTMLElement,
  permissionChecks: Pick<SheetPermissionCheckController, 'triggerPermissionUIEvent$'>,
  onAttempt: () => void
): { notify: () => void; dispose: () => void } {
  let lastNotice = -Infinity
  let surfaceFocused = false
  const notify = (): void => {
    if (!container.isConnected || container.getClientRects().length === 0) return
    const now = Date.now()
    if (now - lastNotice < 2600) return
    lastNotice = now
    onAttempt()
  }
  const onPointerDown = (event: PointerEvent): void => {
    const target = event.target
    surfaceFocused = target instanceof HTMLCanvasElement && container.contains(target)
  }
  const onDoubleClick = (event: MouseEvent): void => {
    if (event.target instanceof HTMLCanvasElement) notify()
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!surfaceFocused) return
    const target = event.target
    const input =
      target instanceof Element ? target.closest('input, textarea, [contenteditable="true"]') : null
    // Univer routes keyboard input through a hidden contenteditable even when the
    // worksheet canvas has focus. Ordinary inputs (name box, find, zoom) stay navigable.
    if (input && !input.matches('[data-u-comp="editor"][contenteditable="true"]')) return
    const modifier = event.ctrlKey || event.metaKey
    const writeShortcut = modifier && ['v', 'x', 'z', 'y'].includes(event.key.toLowerCase())
    const writeKey =
      !modifier &&
      !event.altKey &&
      (event.key.length === 1 || ['F2', 'Backspace', 'Delete'].includes(event.key))
    if (writeShortcut || writeKey) notify()
  }
  const onBeforeInput = (event: InputEvent): void => {
    // Copy can stage text in Univer's hidden editor via beforeinput. Only composition
    // needs this extra path; ordinary typing and paste are covered by keyboard events.
    if (
      (event.isComposing || event.inputType === 'insertCompositionText') &&
      surfaceFocused &&
      event.target instanceof Element &&
      event.target.matches('[data-u-comp="editor"][contenteditable="true"]')
    )
      notify()
  }
  const onPaste = (): void => {
    if (surfaceFocused) notify()
  }
  const subscription = permissionChecks.triggerPermissionUIEvent$.subscribe(notify)
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('beforeinput', onBeforeInput, true)
  container.addEventListener('dblclick', onDoubleClick, true)
  container.addEventListener('paste', onPaste, true)
  return {
    notify,
    dispose: () => {
      subscription.unsubscribe()
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('beforeinput', onBeforeInput, true)
      container.removeEventListener('dblclick', onDoubleClick, true)
      container.removeEventListener('paste', onPaste, true)
    }
  }
}
