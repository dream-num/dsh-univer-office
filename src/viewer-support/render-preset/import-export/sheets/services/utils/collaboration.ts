import type { IAccessor, UnitModel, UniverInstanceType } from '@univerjs/core'
import { ISnapshotServerService, SnapshotService } from '@univerjs-pro/collaboration'
import { IUniverInstanceService } from '@univerjs/core'

export function isCurrentUnitLoadedFromServer(
  accessor: IAccessor,
  type: UniverInstanceType
): boolean {
  const unit = accessor.get(IUniverInstanceService).getCurrentUnitOfType<UnitModel>(type)
  if (!unit || !accessor.has(SnapshotService) || !accessor.has(ISnapshotServerService)) {
    return false
  }

  return accessor.get(SnapshotService).isUnitLoadedFromServer(unit)
}
