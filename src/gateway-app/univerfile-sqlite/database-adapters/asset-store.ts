import { createHash, randomUUID } from "node:crypto";
import type Database from "libsql";
import type { UniverfileSQLiteConnection } from "../connection.js";
import { runUniverfileSQLiteTransaction } from "../connection.js";

const ASSET_SCHEMA_COMPONENT = "assets";
const ASSET_SCHEMA_VERSION = 1;
const ASSET_TABLES = ["collaboration_asset_blobs", "collaboration_assets"] as const;

export const MAX_UNIVERFILE_ASSET_BYTES = 50 * 1024 * 1024;

export interface UniverfileAssetRecord {
  readonly assetId: string;
  readonly unitId: string;
  readonly worktreeId: string | null;
  readonly digest: string;
  readonly originalFilename: string;
  readonly mediaType: string;
  readonly byteSize: number;
  readonly createdAtMs: number;
}

export interface UniverfileOpenedAsset {
  readonly record: UniverfileAssetRecord;
  readonly bytes: Uint8Array;
}

interface AssetRow {
  readonly asset_id: string;
  readonly unit_id: string;
  readonly worktree_id: string | null;
  readonly digest: string;
  readonly original_filename: string;
  readonly media_type: string;
  readonly byte_size: number;
  readonly created_at_ms: number;
}

interface OpenedAssetRow extends AssetRow {
  readonly bytes: Uint8Array | ArrayBuffer;
}

interface SchemaVersionRow {
  readonly version: number;
}

interface TableNameRow {
  readonly name: string;
}

export interface UniverfileSQLiteAssetStoreOptions {
  readonly connection: UniverfileSQLiteConnection;
}

/**
 * Immutable embedded-asset metadata plus content-addressed bytes inside one `.univer` SQLite file.
 * Snapshot and changeset payloads only carry the opaque `assetId`; repeated uploads may create
 * distinct scoped identities, while the digest table stores identical bytes once.
 */
export class UniverfileSQLiteAssetStore {
  private readonly _database: Database.Database;

  public constructor(options: UniverfileSQLiteAssetStoreOptions) {
    this._database = options.connection.database;
    this._initializeSchema();
  }

  public store(input: {
    readonly unitId: string;
    readonly worktreeId?: string;
    readonly originalFilename: string;
    readonly mediaType: string;
    readonly bytes: Uint8Array;
    readonly reuseInScope?: boolean;
  }): UniverfileAssetRecord {
    validateStoredAsset(input);
    const bytes = Uint8Array.from(input.bytes);
    const digest = createHash("sha256").update(bytes).digest("hex");
    const worktreeId = input.worktreeId ?? null;

    return runUniverfileSQLiteTransaction(this._database, () => {
      if (input.reuseInScope === true) {
        const existing = this._findByDigest(input.unitId, worktreeId, digest);
        if (existing !== null) return existing;
      }

      this._database
        .prepare(
          `INSERT INTO collaboration_asset_blobs (digest, byte_size, bytes)
           VALUES (?, ?, ?)
           ON CONFLICT(digest) DO NOTHING`,
        )
        .run(digest, bytes.byteLength, Buffer.from(bytes));
      const blob = this._database
        .prepare("SELECT byte_size FROM collaboration_asset_blobs WHERE digest = ?")
        .get(digest) as { readonly byte_size: number } | undefined;
      if (blob?.byte_size !== bytes.byteLength) {
        throw new Error("Stored asset digest has conflicting byte length");
      }

      const assetId = randomUUID();
      const createdAtMs = Date.now();
      this._database
        .prepare(
          `INSERT INTO collaboration_assets
             (asset_id, unit_id, worktree_id, digest, original_filename, media_type, byte_size,
              created_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          assetId,
          input.unitId,
          worktreeId,
          digest,
          input.originalFilename,
          input.mediaType,
          bytes.byteLength,
          createdAtMs,
        );
      return this._require(assetId);
    });
  }

  public open(assetId: string): UniverfileOpenedAsset | null {
    const row = this._database
      .prepare(
        `SELECT a.asset_id, a.unit_id, a.worktree_id, a.digest, a.original_filename,
                a.media_type, a.byte_size, a.created_at_ms, b.bytes
         FROM collaboration_assets AS a
         JOIN collaboration_asset_blobs AS b ON b.digest = a.digest
         WHERE a.asset_id = ?`,
      )
      .get(assetId) as OpenedAssetRow | undefined;
    if (row === undefined) return null;
    return { record: toRecord(row), bytes: normalizeBlob(row.bytes) };
  }

  public publishWorktreeAssets(worktreeId: string, unitIds: readonly string[]): number {
    const publish = this._database.prepare(
      `UPDATE collaboration_assets
       SET worktree_id = NULL
       WHERE worktree_id = ? AND unit_id = ?`,
    );
    return runUniverfileSQLiteTransaction(this._database, () => {
      let count = 0;
      for (const unitId of new Set(unitIds)) {
        count += Number(publish.run(worktreeId, unitId).changes);
      }
      return count;
    });
  }

  public countBlobs(): number {
    const row = this._database
      .prepare("SELECT COUNT(*) AS count FROM collaboration_asset_blobs")
      .get() as { readonly count: number };
    return row.count;
  }

  public countAssets(): number {
    const row = this._database
      .prepare("SELECT COUNT(*) AS count FROM collaboration_assets")
      .get() as { readonly count: number };
    return row.count;
  }

  private _findByDigest(
    unitId: string,
    worktreeId: string | null,
    digest: string,
  ): UniverfileAssetRecord | null {
    const row = this._database
      .prepare(
        `SELECT asset_id, unit_id, worktree_id, digest, original_filename, media_type, byte_size,
                created_at_ms
         FROM collaboration_assets
         WHERE unit_id = ? AND worktree_id IS ? AND digest = ?
         ORDER BY created_at_ms, asset_id
         LIMIT 1`,
      )
      .get(unitId, worktreeId, digest) as AssetRow | undefined;
    return row === undefined ? null : toRecord(row);
  }

  private _require(assetId: string): UniverfileAssetRecord {
    const row = this._database
      .prepare(
        `SELECT asset_id, unit_id, worktree_id, digest, original_filename, media_type, byte_size,
                created_at_ms
         FROM collaboration_assets
         WHERE asset_id = ?`,
      )
      .get(assetId) as AssetRow | undefined;
    if (row === undefined) throw new Error("Stored collaboration asset is missing");
    return toRecord(row);
  }

  private _initializeSchema(): void {
    const version = this._database
      .prepare("SELECT version FROM collaboration_schema_versions WHERE component = ?")
      .get(ASSET_SCHEMA_COMPONENT) as SchemaVersionRow | undefined;
    const placeholders = ASSET_TABLES.map(() => "?").join(", ");
    const existingTables = this._database
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`)
      .all(...ASSET_TABLES) as unknown as TableNameRow[];

    if (version !== undefined) {
      if (
        version.version !== ASSET_SCHEMA_VERSION ||
        existingTables.length !== ASSET_TABLES.length
      ) {
        throw new Error(
          `unsupported collaboration assets schema: expected ${ASSET_SCHEMA_VERSION} with all tables`,
        );
      }
      return;
    }
    if (existingTables.length > 0) {
      throw new Error("collaboration assets tables exist without a schema version");
    }

    runUniverfileSQLiteTransaction(this._database, () => {
      this._database.exec(`
        CREATE TABLE collaboration_asset_blobs (
          digest TEXT PRIMARY KEY CHECK (length(digest) = 64),
          byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
          bytes BLOB NOT NULL
        ) STRICT, WITHOUT ROWID;

        CREATE TABLE collaboration_assets (
          asset_id TEXT PRIMARY KEY,
          unit_id TEXT NOT NULL,
          worktree_id TEXT,
          digest TEXT NOT NULL,
          original_filename TEXT NOT NULL,
          media_type TEXT NOT NULL,
          byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
          created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
          FOREIGN KEY (digest) REFERENCES collaboration_asset_blobs(digest) ON DELETE RESTRICT
        ) STRICT;

        CREATE INDEX collaboration_assets_scope
          ON collaboration_assets(unit_id, worktree_id, created_at_ms, asset_id);

        INSERT INTO collaboration_schema_versions (component, version)
        VALUES ('assets', 1);
      `);
    });
  }
}

function normalizeBlob(bytes: Uint8Array | ArrayBuffer): Uint8Array {
  return bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : Uint8Array.from(bytes);
}

function toRecord(row: AssetRow): UniverfileAssetRecord {
  return {
    assetId: row.asset_id,
    unitId: row.unit_id,
    worktreeId: row.worktree_id,
    digest: row.digest,
    originalFilename: row.original_filename,
    mediaType: row.media_type,
    byteSize: row.byte_size,
    createdAtMs: row.created_at_ms,
  };
}

function validateStoredAsset(input: {
  readonly unitId: string;
  readonly worktreeId?: string;
  readonly originalFilename: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}): void {
  if (input.unitId.length === 0 || input.unitId.length > 255) {
    throw new Error("Asset Unit ID is invalid");
  }
  if (input.worktreeId !== undefined && input.worktreeId.length === 0) {
    throw new Error("Asset Worktree ID is invalid");
  }
  if (input.originalFilename.length === 0 || input.originalFilename.length > 1024) {
    throw new Error("Asset filename is invalid");
  }
  if (input.mediaType.length === 0 || input.mediaType.length > 255) {
    throw new Error("Asset media type is invalid");
  }
  if (input.bytes.byteLength > MAX_UNIVERFILE_ASSET_BYTES) {
    throw new Error(`Asset exceeds the ${MAX_UNIVERFILE_ASSET_BYTES} byte limit`);
  }
}
