import type Database from 'libsql'
import { runUniverfileSQLiteTransaction } from '../../connection.ts'
import { migrateUniverfileCoreSchema } from '../core.ts'
import { migrateUniverfileHistorySchema } from '../history.ts'
import { toUnixMilliseconds } from '../legacy-creation.ts'
import { migrateUniverfileWorktreeSchema } from '../worktree.ts'

/** Core and Worktree must consume legacy creation facts before History removes its revision table. */
export function migrateV2CandidateToV3(database: Database.Database): void {
  migrateUniverfileCoreSchema(database)
  migrateUniverfileWorktreeSchema(database)
  migrateUniverfileHistorySchema(database)
}

interface ChangesetTimeRow {
  readonly rowid: number
  readonly unit_id: string
  readonly payload_json: string
  readonly created_at_ms: number
}

/** SDK History reads protocol payloads, so normalizing only the separate time column is insufficient. */
export function normalizeCandidateChangesetTimes(database: Database.Database): void {
  runUniverfileSQLiteTransaction(database, () => {
    for (const table of ['collaboration_changesets', 'collaboration_worktree_changesets']) {
      const rows = database
        .prepare(`SELECT rowid, unit_id, payload_json, created_at_ms FROM ${table}`)
        .iterate() as unknown as IterableIterator<ChangesetTimeRow>
      const update = database.prepare(`UPDATE ${table} SET payload_json = ? WHERE rowid = ?`)
      for (const row of rows) {
        const payload: unknown = JSON.parse(row.payload_json)
        if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
          throw new Error(`Unit ${row.unit_id} has an invalid changeset payload`)
        }
        const value = 'createTime' in payload ? payload.createTime : undefined
        const milliseconds =
          (typeof value === 'number' ? toUnixMilliseconds(value) : undefined) ?? row.created_at_ms
        if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
          throw new Error(`Unit ${row.unit_id} has no usable changeset creation time`)
        }
        // Preserve all other protocol fields and encoded binary values verbatim as JSON values.
        update.run(
          JSON.stringify({ ...payload, createTime: Math.floor(milliseconds / 1000) }),
          row.rowid
        )
      }
    }
  })
}
