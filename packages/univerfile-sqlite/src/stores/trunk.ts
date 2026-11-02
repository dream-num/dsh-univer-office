import type { DatabaseSync } from 'node:sqlite'
import {
  CollabError,
  type CommitChangesetInput,
  type CommitChangesetResult,
  type CreateUnitDatabaseInput,
  type CreateUnitDatabaseResult,
  type DatabaseContext,
  type DeleteUnitsDatabaseInput,
  type DeleteUnitsDatabaseResult,
  type IDatabaseAdapter,
  type RecoverUnitsDatabaseInput,
  type RecoverUnitsDatabaseResult,
  type SaveSnapshotInput,
  type SnapshotInfo,
  type UnitRecord
} from '@univerjs-pro/collaboration-service'
import type { IChangeset, ISheetBlock, ISnapshot, UniverType } from '@univerjs/protocol'
import type { UniverfileSQLiteConnection } from '../driver/connection.ts'
import { runUniverfileSQLiteTransaction } from '../driver/transaction.ts'
import { decodeStoredJson, encodeStoredJson } from '../codec/stored-json.ts'

interface UnitRow {
  readonly unit_id: string
  readonly type: number
  readonly name: string
  readonly head_revision: number
  readonly creator_id: string
  readonly created_at_ms: number
  readonly soft_deleted_at_ms: number | null
}

interface SnapshotPayloadRow {
  readonly revision: number
  readonly payload_json: string
}

interface PayloadRow {
  readonly payload_json: string
}

export interface TrunkStoreOptions {
  /** SQLite filename or `:memory:`; must match the connection. */
  readonly filename: string
  /** Shared connection to a file whose current schema is installed. The adapter never closes it. */
  readonly connection: UniverfileSQLiteConnection
}

/**
 * Node 22+ SQLite implementation of the collaboration persistence contract.
 *
 * The Node API is synchronous, while IDatabaseAdapter remains asynchronous so
 * applications can swap this adapter for a remote database implementation.
 */
export interface UniverfileUnitMetadata {
  readonly name?: string
  /** Merge may create several Worktree Units in trunk under one SDK call. */
  readonly unitNames?: Readonly<Record<string, string>>
}

export interface UniverfileUnitSummary {
  readonly unitId: string
  readonly type: UniverType
  readonly name: string
  readonly headRev: number
  readonly createdAt: string
}

/**
 * Gateway 通过 request customData 把产品 metadata 带到 SDK Database Adapter。
 * SDK 不解释该字段；CLI-owned Adapter 在创建 Unit 的同一事务中持久化。
 */
export const UNIVERFILE_UNIT_METADATA_KEY = '@univer/univerfile-sqlite/unit-metadata'

export interface UniverfileUnitSnapshots {
  readonly unitId: string
  /** Revisions of the stored snapshots, ascending. */
  readonly revisions: readonly number[]
}

export interface UniverfileDeletedSnapshots {
  readonly snapshots: number
  readonly sheetBlocks: number
}

/** Trunk persistence: the SDK contract plus the Unit listings and maintenance the application needs. */
export interface UniverfileTrunkStore extends IDatabaseAdapter {
  listUnits(): readonly UniverfileUnitSummary[]
  listUnitRecords(): readonly UnitRecord[]
  /** Stored snapshot revisions of every Unit, including soft-deleted ones, ordered by Unit id. */
  listSnapshotRevisions(): readonly UniverfileUnitSnapshots[]
  /**
   * Deletes the given snapshots of one Unit, and the Sheet blocks that only those snapshots
   * referenced. Changesets stay, so every revision remains readable by replaying from an earlier
   * snapshot; for the same reason the Unit's earliest snapshot cannot be deleted.
   */
  deleteSnapshots(unitID: string, revisions: readonly number[]): UniverfileDeletedSnapshots
}

export class TrunkStore implements UniverfileTrunkStore {
  private readonly _database: DatabaseSync
  private _disposed = false

  constructor(options: TrunkStoreOptions) {
    validateOptions(options)
    this._database = options.connection.database
  }

  public listSnapshotRevisions(): readonly UniverfileUnitSnapshots[] {
    this._assertOpen()
    const rows = this._database
      .prepare(
        `SELECT unit_id, revision
         FROM collaboration_snapshots
         ORDER BY unit_id, revision`
      )
      .all() as unknown as { readonly unit_id: string; readonly revision: number }[]
    const byUnit = new Map<string, number[]>()
    for (const row of rows) {
      const revisions = byUnit.get(row.unit_id) ?? []
      revisions.push(row.revision)
      byUnit.set(row.unit_id, revisions)
    }
    return [...byUnit].map(([unitId, revisions]) => ({ unitId, revisions }))
  }

  public deleteSnapshots(unitID: string, revisions: readonly number[]): UniverfileDeletedSnapshots {
    this._assertOpen()
    return this._transaction(() => {
      const rows = this._database
        .prepare(
          `SELECT revision, payload_json
           FROM collaboration_snapshots
           WHERE unit_id = ?
           ORDER BY revision`
        )
        .all(unitID) as unknown as SnapshotPayloadRow[]
      const requested = new Set(revisions)
      if (rows[0] !== undefined && requested.has(rows[0].revision)) {
        throw invalidRequest(
          `Snapshot ${rows[0].revision} is the earliest snapshot of Unit ${unitID} and cannot be deleted`
        )
      }
      const deleted = rows.filter(({ revision }) => requested.has(revision))
      const kept = rows.filter(({ revision }) => !requested.has(revision))
      const stillReferenced = new Set(
        kept.flatMap(({ payload_json }) => sheetBlockIds(payload_json))
      )
      const orphaned = new Set(
        deleted
          .flatMap(({ payload_json }) => sheetBlockIds(payload_json))
          .filter((blockID) => !stillReferenced.has(blockID))
      )
      const deleteSnapshot = this._database.prepare(
        'DELETE FROM collaboration_snapshots WHERE unit_id = ? AND revision = ?'
      )
      for (const { revision } of deleted) deleteSnapshot.run(unitID, revision)
      const deleteBlock = this._database.prepare(
        'DELETE FROM collaboration_sheet_blocks WHERE unit_id = ? AND block_id = ?'
      )
      let sheetBlocks = 0
      for (const blockID of orphaned) {
        sheetBlocks += Number(deleteBlock.run(unitID, blockID).changes)
      }
      return { snapshots: deleted.length, sheetBlocks }
    })
  }

  async getUnit(_context: DatabaseContext, unitID: string): Promise<UnitRecord | null> {
    this._assertOpen()
    const row = this._database
      .prepare(
        `SELECT unit_id, type, name, head_revision, creator_id, created_at_ms, soft_deleted_at_ms
         FROM collaboration_units
         WHERE unit_id = ? AND soft_deleted_at_ms IS NULL`
      )
      .get(unitID) as UnitRow | undefined
    return row ? rowToUnitRecord(row) : null
  }

  public listUnits(): readonly UniverfileUnitSummary[] {
    this._assertOpen()
    const rows = this._database
      .prepare(
        `SELECT unit_id, type, name, head_revision, creator_id, created_at_ms, soft_deleted_at_ms
         FROM collaboration_units
         WHERE soft_deleted_at_ms IS NULL
         ORDER BY created_at_ms ASC, unit_id ASC`
      )
      .all() as unknown as UnitRow[]
    return rows.map(rowToUnitSummary)
  }

  /** Active Unit records in catalog order, for synchronous Gateway compatibility entries. */
  public listUnitRecords(): readonly UnitRecord[] {
    this._assertOpen()
    const rows = this._database
      .prepare(
        `SELECT unit_id, type, name, head_revision, creator_id, created_at_ms, soft_deleted_at_ms
         FROM collaboration_units
         WHERE soft_deleted_at_ms IS NULL
         ORDER BY created_at_ms ASC, unit_id ASC`
      )
      .all() as unknown as UnitRow[]
    return rows.map(rowToUnitRecord)
  }

  async getSnapshot(
    _context: DatabaseContext,
    unitID: string,
    options?: { readonly revision?: number }
  ): Promise<ISnapshot | null> {
    this._assertOpen()
    const requestedRevision = options?.revision
    if (requestedRevision !== undefined && requestedRevision < 0) {
      throw invalidRequest('Snapshot revision cannot be negative')
    }

    const unit = this._getActiveUnitRow(unitID)
    if (!unit) {
      return null
    }
    const targetRevision =
      requestedRevision === undefined || requestedRevision === 0
        ? unit.head_revision
        : Math.min(requestedRevision, unit.head_revision)
    const row = this._database
      .prepare(
        `SELECT collaboration_snapshots.payload_json
         FROM collaboration_snapshots
         JOIN collaboration_units
           ON collaboration_units.unit_id = collaboration_snapshots.unit_id
         WHERE collaboration_snapshots.unit_id = ?
           AND collaboration_snapshots.revision <= ?
           AND collaboration_units.soft_deleted_at_ms IS NULL
         ORDER BY collaboration_snapshots.revision DESC
         LIMIT 1`
      )
      .get(unitID, targetRevision) as PayloadRow | undefined
    return row ? decodeStoredJson<ISnapshot>(row.payload_json) : null
  }

  async getChangesets(
    _context: DatabaseContext,
    unitID: string,
    range: { readonly from: number; readonly to?: number }
  ): Promise<readonly IChangeset[] | null> {
    this._assertOpen()
    const to = range.to ?? 0
    if (range.from < 0 || to < 0) {
      throw invalidRequest('Changeset range revisions cannot be negative')
    }

    const unit = this._getActiveUnitRow(unitID)
    if (!unit) {
      return null
    }
    const rows = this._database
      .prepare(
        `SELECT payload_json
         FROM collaboration_changesets
         WHERE unit_id = ? AND revision > ? AND revision <= CASE
           WHEN ? = 0 THEN ?
           ELSE MIN(?, ?)
         END
         ORDER BY revision ASC`
      )
      .all(
        unitID,
        range.from,
        to,
        unit.head_revision,
        to,
        unit.head_revision
      ) as unknown as PayloadRow[]
    return rows.map((row) => decodeStoredJson<IChangeset>(row.payload_json))
  }

  async getSnapshotInfo(
    _context: DatabaseContext,
    unitID: string,
    options?: { readonly revision?: number }
  ): Promise<SnapshotInfo | null> {
    this._assertOpen()
    const requestedRevision = options?.revision
    if (requestedRevision !== undefined && requestedRevision < 0) {
      throw invalidRequest('Snapshot revision cannot be negative')
    }

    const unit = this._getActiveUnitRow(unitID)
    if (!unit) {
      return null
    }
    const targetRevision =
      requestedRevision === undefined || requestedRevision === 0
        ? unit.head_revision
        : Math.min(requestedRevision, unit.head_revision)
    const row = this._database
      .prepare(
        `SELECT collaboration_snapshots.revision
         FROM collaboration_snapshots
         JOIN collaboration_units
           ON collaboration_units.unit_id = collaboration_snapshots.unit_id
         WHERE collaboration_snapshots.unit_id = ?
           AND collaboration_snapshots.revision <= ?
           AND collaboration_units.soft_deleted_at_ms IS NULL
         ORDER BY collaboration_snapshots.revision DESC
         LIMIT 1`
      )
      .get(unitID, targetRevision) as { revision: number } | undefined
    if (!row) {
      return null
    }
    return { unitID, type: unit.type as UniverType, rev: row.revision }
  }

  async createUnit(
    context: DatabaseContext,
    input: CreateUnitDatabaseInput
  ): Promise<CreateUnitDatabaseResult> {
    this._assertOpen()
    validateInitialUnit(input)

    const snapshotPayload = encodeStoredJson(input.snapshot)
    const blocks = (input.sheetBlocks ?? []).map((block) => ({
      id: block.id,
      payload: encodeStoredJson(block)
    }))
    return this._transaction(() => {
      if (this._hasTombstone(input.record.unitID)) {
        throw invalidRequest('Cannot reuse a hard-deleted unit ID')
      }
      const existing = this._getStoredUnitRow(input.record.unitID)
      if (existing) {
        if (existing.soft_deleted_at_ms !== null) {
          throw invalidRequest('Cannot reuse a soft-deleted unit ID')
        }
        return { status: 'already-exists', record: rowToUnitRecord(existing) }
      }

      this._database
        .prepare(
          `INSERT INTO collaboration_units
             (unit_id, type, name, head_revision, creator_id, created_at_ms, soft_deleted_at_ms)
           VALUES (?, ?, ?, 1, ?, ?, NULL)`
        )
        .run(
          input.record.unitID,
          input.record.type,
          readUnitName(context, input.record.unitID),
          input.record.creatorID,
          input.record.createdAt
        )
      this._writeSheetBlocks(input.record.unitID, blocks)
      this._database
        .prepare(
          `INSERT INTO collaboration_snapshots
             (unit_id, revision, type, payload_json)
           VALUES (?, 1, ?, ?)`
        )
        .run(input.record.unitID, input.record.type, snapshotPayload)

      return { status: 'created', record: { ...input.record } }
    })
  }

  async deleteUnits(
    _context: DatabaseContext,
    input: DeleteUnitsDatabaseInput
  ): Promise<DeleteUnitsDatabaseResult> {
    this._assertOpen()

    return this._transaction(() => {
      const units = uniqueUnitIDs(input.unitIDs).map((unitID) => {
        const unit = this._getStoredUnitRow(unitID)
        if (!unit) {
          if (input.hardDelete && this._hasTombstone(unitID)) {
            return { unitID, status: 'already-hard-deleted' as const }
          }
          throw new CollabError('UNIT_NOT_FOUND', 'Cannot delete a missing unit')
        }

        if (input.hardDelete) {
          return { unitID, status: 'hard-deleted' as const }
        }
        return {
          unitID,
          status:
            unit.soft_deleted_at_ms === null
              ? ('soft-deleted' as const)
              : ('already-soft-deleted' as const)
        }
      })

      const softDelete = this._database.prepare(
        `UPDATE collaboration_units
         SET soft_deleted_at_ms = ?
         WHERE unit_id = ? AND soft_deleted_at_ms IS NULL`
      )
      const insertTombstone = this._database.prepare(
        `INSERT INTO collaboration_unit_tombstones (unit_id, purged_at)
         VALUES (?, ?)`
      )
      const deleteUnit = this._database.prepare('DELETE FROM collaboration_units WHERE unit_id = ?')
      const purgedAt = Date.now()

      for (const unit of units) {
        if (unit.status === 'soft-deleted') {
          softDelete.run(purgedAt, unit.unitID)
        } else if (unit.status === 'hard-deleted') {
          insertTombstone.run(unit.unitID, purgedAt)
          deleteUnit.run(unit.unitID)
        }
      }

      return { units }
    })
  }

  async recoverUnits(
    _context: DatabaseContext,
    input: RecoverUnitsDatabaseInput
  ): Promise<RecoverUnitsDatabaseResult> {
    this._assertOpen()

    return this._transaction(() => {
      const units = uniqueUnitIDs(input.unitIDs).map((unitID) => {
        const unit = this._getStoredUnitRow(unitID)
        if (!unit) {
          if (this._hasTombstone(unitID)) {
            throw invalidRequest('Cannot recover a hard-deleted unit')
          }
          throw new CollabError('UNIT_NOT_FOUND', 'Cannot recover a missing unit')
        }
        return {
          unitID,
          status:
            unit.soft_deleted_at_ms === null ? ('already-active' as const) : ('recovered' as const)
        }
      })

      const recover = this._database.prepare(
        `UPDATE collaboration_units
         SET soft_deleted_at_ms = NULL
         WHERE unit_id = ? AND soft_deleted_at_ms IS NOT NULL`
      )
      for (const unit of units) {
        if (unit.status === 'recovered') {
          recover.run(unit.unitID)
        }
      }

      return { units }
    })
  }

  async commitChangeset(
    context: DatabaseContext,
    input: CommitChangesetInput
  ): Promise<CommitChangesetResult> {
    this._assertOpen()
    validateSubmissionIdentity(input.changeset)
    const createdAt = Date.now()
    const changeset: IChangeset = {
      ...input.changeset,
      createTime: Math.floor(createdAt / 1000)
    }
    const payload = encodeStoredJson(changeset)

    return this._transaction(() => {
      const unit = this._getActiveUnitRow(changeset.unitID)
      if (!unit) {
        throw new CollabError('UNIT_NOT_FOUND', 'Cannot commit to a missing unit')
      }

      if (unit.head_revision !== changeset.baseRev) {
        return {
          status: 'revision-mismatch',
          actualHeadRevision: unit.head_revision
        }
      }

      validateCandidate(rowToUnitRecord(unit), changeset)
      this._database
        .prepare(
          `INSERT INTO collaboration_changesets
             (unit_id, revision, base_revision, sid, req_id, payload_json, created_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          changeset.unitID,
          changeset.revision,
          changeset.baseRev,
          changeset.sid as string,
          changeset.reqId as number,
          payload,
          createdAt
        )
      const update = this._database
        .prepare(
          `UPDATE collaboration_units
           SET head_revision = ?, name = COALESCE(?, name)
           WHERE unit_id = ?
             AND head_revision = ?
             AND soft_deleted_at_ms IS NULL`
        )
        .run(
          changeset.revision,
          readOptionalUnitName(context, changeset.unitID) ?? null,
          changeset.unitID,
          changeset.baseRev
        )
      if (update.changes !== 1) {
        throw new CollabError(
          'INTERNAL_ERROR',
          'SQLite head changed inside an exclusive write transaction'
        )
      }

      return {
        status: 'committed',
        changeset: decodeStoredJson<IChangeset>(payload),
        headRevision: changeset.revision
      }
    })
  }

  async saveSnapshot(_context: DatabaseContext, input: SaveSnapshotInput): Promise<void> {
    this._assertOpen()
    const snapshotPayload = encodeStoredJson(input.snapshot)
    const blocks = (input.sheetBlocks ?? []).map((block) => ({
      id: block.id,
      payload: encodeStoredJson(block)
    }))
    this._transaction(() => {
      const unit = this._getActiveUnitRow(input.snapshot.unitID)
      if (!unit) {
        throw new CollabError('UNIT_NOT_FOUND', 'Cannot snapshot a missing unit')
      }
      if (
        input.snapshot.type !== unit.type ||
        input.snapshot.rev < 1 ||
        input.snapshot.rev > unit.head_revision
      ) {
        throw invalidRequest('Snapshot does not match the stored unit head')
      }

      this._writeSheetBlocks(input.snapshot.unitID, blocks)
      this._database
        .prepare(
          `INSERT INTO collaboration_snapshots
             (unit_id, revision, type, payload_json)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(unit_id, revision) DO UPDATE SET
             type = excluded.type,
             payload_json = excluded.payload_json`
        )
        .run(input.snapshot.unitID, input.snapshot.rev, input.snapshot.type, snapshotPayload)
    })
  }

  async getSheetBlock(
    _context: DatabaseContext,
    unitID: string,
    blockID: string
  ): Promise<ISheetBlock | null> {
    this._assertOpen()
    const row = this._database
      .prepare(
        `SELECT collaboration_sheet_blocks.payload_json
         FROM collaboration_sheet_blocks
         JOIN collaboration_units
           ON collaboration_units.unit_id = collaboration_sheet_blocks.unit_id
         WHERE collaboration_sheet_blocks.unit_id = ?
           AND collaboration_sheet_blocks.block_id = ?
           AND collaboration_units.soft_deleted_at_ms IS NULL`
      )
      .get(unitID, blockID) as PayloadRow | undefined
    return row ? decodeStoredJson<ISheetBlock>(row.payload_json) : null
  }

  async dispose(): Promise<void> {
    if (this._disposed) {
      return
    }
    this._disposed = true
  }

  private _getActiveUnitRow(unitID: string): UnitRow | null {
    const row = this._database
      .prepare(
        `SELECT unit_id, type, name, head_revision, creator_id, created_at_ms, soft_deleted_at_ms
         FROM collaboration_units
         WHERE unit_id = ? AND soft_deleted_at_ms IS NULL`
      )
      .get(unitID) as UnitRow | undefined
    return row ?? null
  }

  private _getStoredUnitRow(unitID: string): UnitRow | null {
    const row = this._database
      .prepare(
        `SELECT unit_id, type, name, head_revision, creator_id, created_at_ms, soft_deleted_at_ms
         FROM collaboration_units
         WHERE unit_id = ?`
      )
      .get(unitID) as UnitRow | undefined
    return row ?? null
  }

  private _hasTombstone(unitID: string): boolean {
    return Boolean(
      this._database
        .prepare('SELECT 1 FROM collaboration_unit_tombstones WHERE unit_id = ?')
        .get(unitID)
    )
  }

  private _writeSheetBlocks(
    unitID: string,
    blocks: readonly { readonly id: string; readonly payload: string }[]
  ): void {
    const blockStatement = this._database.prepare(
      `INSERT INTO collaboration_sheet_blocks
         (unit_id, block_id, payload_json)
       VALUES (?, ?, ?)
       ON CONFLICT(unit_id, block_id) DO UPDATE SET
         payload_json = excluded.payload_json`
    )
    for (const block of blocks) {
      blockStatement.run(unitID, block.id, block.payload)
    }
  }

  private _transaction<T>(operation: () => T): T {
    return runUniverfileSQLiteTransaction(this._database, operation)
  }

  private _assertOpen(): void {
    if (this._disposed) {
      throw new CollabError('INTERNAL_ERROR', 'SQLite Database Adapter is disposed')
    }
  }
}

function validateOptions(options: TrunkStoreOptions): void {
  if (!options.filename) {
    throw invalidRequest('SQLite filename is required')
  }
  if (options.connection.filename !== options.filename) {
    throw invalidRequest('Shared SQLite connection filename does not match adapter filename')
  }
}

function validateInitialUnit(input: CreateUnitDatabaseInput): void {
  const { record, snapshot } = input
  if (
    record.headRevision !== 1 ||
    snapshot.rev !== 1 ||
    snapshot.unitID !== record.unitID ||
    snapshot.type !== record.type
  ) {
    throw invalidRequest('Initial unit record and snapshot must match at revision 1')
  }
  if (
    typeof record.creatorID !== 'string' ||
    record.creatorID.length === 0 ||
    !Number.isSafeInteger(record.createdAt) ||
    record.createdAt < 0
  ) {
    throw invalidRequest('Unit creation requires creatorID and createdAt in Unix milliseconds')
  }
}

function validateSubmissionIdentity(changeset: IChangeset): void {
  if (!changeset.sid || !Number.isSafeInteger(changeset.reqId) || (changeset.reqId as number) < 1) {
    throw invalidRequest('Changeset sid and positive integer reqId are required')
  }
}

function validateCandidate(record: UnitRecord, changeset: IChangeset): void {
  if (changeset.type !== record.type || changeset.revision !== changeset.baseRev + 1) {
    throw invalidRequest('Confirmed changeset must match the unit type and expected revision')
  }
}

function rowToUnitRecord(row: UnitRow): UnitRecord {
  return {
    unitID: row.unit_id,
    type: row.type as UniverType,
    headRevision: row.head_revision,
    creatorID: row.creator_id,
    createdAt: row.created_at_ms
  }
}

function rowToUnitSummary(row: UnitRow): UniverfileUnitSummary {
  return {
    unitId: row.unit_id,
    type: row.type as UniverType,
    name: row.name,
    headRev: row.head_revision,
    createdAt: new Date(row.created_at_ms).toISOString()
  }
}

function readUnitName(context: DatabaseContext, unitID: string): string {
  const value = context.customData[UNIVERFILE_UNIT_METADATA_KEY] as
    | UniverfileUnitMetadata
    | undefined
  return typeof value?.unitNames?.[unitID] === 'string' && value.unitNames[unitID]!.length > 0
    ? value.unitNames[unitID]!
    : typeof value?.name === 'string' && value.name.length > 0
      ? value.name
      : unitID
}

function readOptionalUnitName(context: DatabaseContext, unitID: string): string | undefined {
  const value = context.customData[UNIVERFILE_UNIT_METADATA_KEY] as
    | UniverfileUnitMetadata
    | undefined
  return typeof value?.unitNames?.[unitID] === 'string'
    ? value.unitNames[unitID]
    : typeof value?.name === 'string'
      ? value.name
      : undefined
}

/** Sheet block ids a stored snapshot lists in `workbook.blockMeta`; other Unit types have none. */
function sheetBlockIds(payload: string): string[] {
  const snapshot = decodeStoredJson<{
    readonly workbook?: { readonly blockMeta?: Record<string, { readonly blocks?: unknown }> }
  }>(payload)
  return Object.values(snapshot.workbook?.blockMeta ?? {}).flatMap(({ blocks }) =>
    Array.isArray(blocks) ? blocks.filter((id): id is string => typeof id === 'string') : []
  )
}

function invalidRequest(message: string): CollabError {
  return new CollabError('INVALID_REQUEST', message)
}

function uniqueUnitIDs(unitIDs: readonly string[]): readonly string[] {
  return [...new Set(unitIDs)]
}
