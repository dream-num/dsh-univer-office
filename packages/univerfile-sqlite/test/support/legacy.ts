// Builders for older `.univer` formats. They write raw SQL against frozen schemas so the files stay
// independent of the current stores and schema module.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

export const context = { userID: 'author', customData: {}, request: {} }
export const createdAt = 1_790_208_000_000

/**
 * A Document snapshot at revision 1. Stores keep snapshots as opaque JSON, so only the identity
 * fields matter; the bytes check that every legacy binary encoding survives an upgrade.
 */
export const snapshot = {
  unitID: 'unit',
  type: 2,
  rev: 1,
  doc: { id: 'unit', body: { dataStream: 'Hello\r\n' } },
  resources: [{ name: 'thumbnail', data: new Uint8Array([0, 128, 255]) }]
}

export const V1_ALTER = `ALTER TABLE collaboration_worktrees ADD COLUMN head_commit INTEGER NOT NULL DEFAULT 0;
  CREATE TABLE collaboration_worktree_commits (worktree_id TEXT, seq INTEGER);
  UPDATE collaboration_schema_versions SET version = 1 WHERE component = 'worktree';`

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), 'utf8')

export function changeset(revision: number, createTime: number) {
  return {
    unitID: 'unit',
    type: 2,
    baseRev: revision - 1,
    revision,
    userID: 'author',
    memberID: '',
    sid: 'session',
    reqId: revision,
    mutations: [],
    createTime
  }
}

/**
 * A v2 file (core v1, worktree v2, assets v1, history v1): one Document at revision 3, a draft
 * Worktree with one change, one asset, and rc History. Pass a runtime-created `snapshot` when the
 * Univer SDK must load the Document; the stores alone accept the fixture snapshot.
 */
export function createV2(
  filename: string,
  options: { readonly active?: boolean; readonly snapshot?: object } = {}
): void {
  const unitSnapshot = options.snapshot ?? snapshot
  const db = new DatabaseSync(filename)
  try {
    db.exec(fixture('univerfile-v2.sql'))
    db.prepare('INSERT INTO collaboration_units VALUES (?, ?, ?, ?, ?, ?)').run(
      'unit',
      2,
      'Document',
      3,
      createdAt,
      null
    )
    for (const revision of [1, 3]) {
      db.prepare('INSERT INTO collaboration_snapshots VALUES (?, ?, ?, ?)').run(
        'unit',
        revision,
        2,
        encodeSnapshot({ ...unitSnapshot, rev: revision })
      )
    }
    for (const revision of [2, 3]) {
      const time = createdAt + revision * 1000
      // Exercise both legacy milliseconds and protocol seconds.
      const payload = changeset(revision, revision === 2 ? time : time / 1000)
      db.prepare('INSERT INTO collaboration_changesets VALUES (?, ?, ?, ?, ?, ?)').run(
        'unit',
        revision,
        revision - 1,
        payload.sid,
        payload.reqId,
        JSON.stringify(payload)
      )
    }
    for (const revision of [1, 2, 3]) {
      db.prepare(
        'INSERT INTO collaboration_history_revisions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        'unit',
        2,
        revision,
        'author',
        '[]',
        createdAt + (revision === 1 ? 0 : revision * 1000),
        null,
        0,
        revision === 1 ? 1 : 2,
        0,
        null
      )
    }
    db.prepare('INSERT INTO collaboration_worktrees VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      'draft',
      'draft-session',
      options.active === true ? 'draft' : 'discarded',
      'author',
      'Draft',
      createdAt + 5000,
      null
    )
    db.prepare(
      'INSERT INTO collaboration_worktree_units VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run('draft', 'unit', 0, 2, 'Document', createdAt + 5000, 'trunk', 3, 4, null, null)
    const draft = changeset(4, createdAt + 6000)
    db.prepare('INSERT INTO collaboration_worktree_changesets VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      'draft',
      'unit',
      4,
      3,
      draft.sid,
      draft.reqId,
      JSON.stringify(draft)
    )
    const bytes = Buffer.from([1, 2, 3])
    const digest = createHash('sha256').update(bytes).digest('hex')
    db.prepare('INSERT INTO collaboration_asset_blobs VALUES (?, ?, ?)').run(
      digest,
      bytes.length,
      bytes
    )
    db.prepare('INSERT INTO collaboration_assets VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      'asset',
      'unit',
      null,
      digest,
      'image.png',
      'image/png',
      bytes.length,
      createdAt
    )
  } finally {
    db.close()
  }
}

/** A v0 file (pre-collaboration CLI tables): one Sheet at revision 2 with one changeset. */
export function createV0(filename: string): void {
  const db = new DatabaseSync(filename)
  try {
    db.exec(fixture('univerfile-v0.sql'))
    const iso = new Date(createdAt).toISOString()
    db.prepare('INSERT INTO units VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      'unit',
      2,
      'Sheet',
      1,
      2,
      iso,
      iso,
      null
    )
    // The pre-collaboration CLI tagged binary fields as `__u8__`.
    const legacySnapshot = JSON.stringify({ ...snapshot, rev: 2 }, (_key, value: unknown) =>
      value instanceof Uint8Array ? { __u8__: Buffer.from(value).toString('base64') } : value
    )
    db.prepare('INSERT INTO snapshots VALUES (?, ?, ?)').run('unit', 2, legacySnapshot)
    db.prepare('INSERT INTO changesets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'unit',
      2,
      2,
      1,
      'author',
      '',
      'session',
      2,
      '[]',
      null,
      null,
      createdAt + 1000
    )
  } finally {
    db.close()
  }
}

/** Component versions a file records, or `null` for a file without the version table. */
export function versionsOf(filename: string): Record<string, number> | null {
  const db = new DatabaseSync(filename, { readOnly: true })
  try {
    const table = db
      .prepare(
        "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'collaboration_schema_versions'"
      )
      .get()
    if (table === undefined) return null
    const rows = db
      .prepare('SELECT component, version FROM collaboration_schema_versions')
      .all() as { component: string; version: number }[]
    return Object.fromEntries(rows.map(({ component, version }) => [component, version]))
  } finally {
    db.close()
  }
}

export const V2_VERSIONS = { core: 1, worktree: 2, assets: 1, history: 1 }
export const V3_VERSIONS = { core: 2, worktree: 3, assets: 1, history: 2 }

export async function backupsOf(directory: string, name: string): Promise<string[]> {
  return (await readdir(directory)).filter((entry) => entry.startsWith(`${name}.backup-`))
}

export function thrown(action: () => unknown): unknown {
  try {
    action()
  } catch (error) {
    return error
  }
  throw new Error('expected the action to throw')
}

function encodeSnapshot(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item instanceof Uint8Array
      ? { __univerCollaborationBinary: Buffer.from(item).toString('base64') }
      : item
  )
}
