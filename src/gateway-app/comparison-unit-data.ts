import type { IWorkbookData } from '@univerjs/core'
import { UniverInstanceType } from '@univerjs/core'
import {
  transformSnapshotToDocumentData,
  transformSnapshotToSlideData,
  transformSnapshotToWorkbookData
} from '@univerjs-pro/collaboration'
import type { IDeserializedSheetBlock, ISheetBlock, ISnapshot } from '@univerjs/protocol'
import { decodeBaseSnapshotData, decodeBoardSnapshotData } from '../shared/base-board-snapshot.ts'

/** Application adapter from Collaboration Protocol snapshots to final UnitData. */
export async function decodeComparisonUnitData(
  unitType: UniverInstanceType,
  snapshot: unknown,
  sheetBlocks: readonly unknown[] = []
): Promise<unknown> {
  const decoded = decodeSnapshotFromWire(snapshot) as ISnapshot
  if (unitType === UniverInstanceType.UNIVER_DOC) return transformSnapshotToDocumentData(decoded)
  if (unitType === UniverInstanceType.UNIVER_SLIDE) return transformSnapshotToSlideData(decoded)
  if (unitType === UniverInstanceType.UNIVER_BASE) {
    return decodeBaseSnapshotData(
      decoded,
      sheetBlocks as readonly (IDeserializedSheetBlock | ISheetBlock)[]
    )
  }
  if (unitType === UniverInstanceType.UNIVER_BOARD) return decodeBoardSnapshotData(decoded)
  if (unitType === UniverInstanceType.UNIVER_SHEET) {
    return decodeComparisonWorkbookData(snapshot, sheetBlocks)
  }
  throw new Error(`Unsupported comparison unit type: ${String(unitType)}`)
}

export async function decodeComparisonWorkbookData(
  snapshot: unknown,
  sheetBlocks: readonly unknown[] = []
): Promise<IWorkbookData> {
  return transformSnapshotToWorkbookData(
    decodeSnapshotFromWire(snapshot) as ISnapshot,
    structuredClone(sheetBlocks) as Parameters<typeof transformSnapshotToWorkbookData>[1]
  )
}

function decodeSnapshotFromWire(snapshot: unknown): unknown {
  if (!isRecord(snapshot)) return snapshot
  const decodeMeta = (meta: unknown): unknown =>
    typeof meta === 'string' ? base64ToBytes(meta) : meta
  const out = { ...snapshot }
  for (const key of ['doc', 'slide', 'board'] as const) {
    const meta = asRecord(snapshot[key])
    if (meta !== undefined) out[key] = { ...meta, originalMeta: decodeMeta(meta.originalMeta) }
  }
  const workbook = asRecord(snapshot.workbook)
  if (workbook !== undefined) {
    const sheets = Object.fromEntries(
      Object.entries(asRecord(workbook.sheets) ?? {}).map(([id, value]) => {
        const sheet = asRecord(value) ?? {}
        return [id, { ...sheet, originalMeta: decodeMeta(sheet.originalMeta) }]
      })
    )
    out.workbook = {
      ...workbook,
      originalMeta: decodeMeta(workbook.originalMeta),
      sheets
    }
  }
  return out
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}
