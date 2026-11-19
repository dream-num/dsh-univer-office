import type { IBoardData } from '@univerjs-pro/boards'
import {
  transformSnapshotToBaseData,
  transformSnapshotToBoardData
} from '@univerjs-pro/collaboration'
import type { IBaseSnapshot } from '@univerjs/core'
import type { IDeserializedSheetBlock, ISheetBlock, ISnapshot } from '@univerjs/protocol'

// Older snapshots can carry decoded JSON metadata, while the SDK consumes UTF-8 bytes.
function metadataBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value
  return new TextEncoder().encode(JSON.stringify(value ?? {}))
}

export function decodeBoardSnapshotData(snapshot: ISnapshot): IBoardData {
  const board = snapshot.board
  if (board === undefined) throw new Error('Missing board metadata')
  const boardData = transformSnapshotToBoardData({
    ...snapshot,
    rev: snapshot.rev || board.rev,
    board: {
      ...board,
      unitID: snapshot.unitID || board.unitID,
      originalMeta: metadataBytes(board.originalMeta)
    }
  })
  // The Board resource list can be stored separately from originalMeta.
  if (board.resources === undefined) return boardData
  return {
    ...boardData,
    resources: board.resources.map(({ id, name, data }) =>
      id === undefined ? { name, data } : { id, name, data }
    )
  }
}

export function decodeBaseSnapshotData(
  snapshot: ISnapshot,
  blocks: readonly (IDeserializedSheetBlock | ISheetBlock)[]
): Promise<IBaseSnapshot> {
  const workbook = snapshot.workbook
  if (workbook === undefined) throw new Error('Missing workbook-shaped Base metadata')
  return transformSnapshotToBaseData(
    {
      ...snapshot,
      workbook: {
        ...workbook,
        originalMeta: metadataBytes(workbook.originalMeta),
        sheets: Object.fromEntries(
          Object.entries(workbook.sheets).map(([id, sheet]) => [
            id,
            { ...sheet, originalMeta: metadataBytes(sheet.originalMeta) }
          ])
        )
      }
    },
    blocks.map((block) =>
      typeof block.data === 'string'
        ? { ...block, data: Uint8Array.from(atob(block.data), (char) => char.charCodeAt(0)) }
        : block
    )
  )
}
