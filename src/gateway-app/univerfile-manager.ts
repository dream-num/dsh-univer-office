import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { CollabService } from "./collab-service.js";
import { EventHub } from "./transport/events.js";

/** One addressable `.univer` file: its normalized identity plus the resident authority. */
export interface Univerfile {
  /** Canonical identity (realpath of the deepest existing ancestor + tail). Single-writer key. */
  readonly path: string;
  readonly collab: CollabService;
  /** WebSocket lifecycle event hub (Univerfile + per-Worktree channels). */
  readonly events: EventHub;
}

/** A bad `univerfile` address (non-`.univer`, outside `allowedRoot`, undecodable key). HTTP 400. */
export class UniverfileError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "UniverfileError";
  }
}

/** Addressed `.univer` does not exist (and the op is not a create). HTTP 404. */
export class UniverfileNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "UniverfileNotFoundError";
  }
}

/** Create requested for a `.univer` that already exists. HTTP 409. */
export class UniverfileExistsError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "UniverfileExistsError";
  }
}

export interface UniverfileManagerOptions {
  /** Confine every `univerfile` under this directory (rejected otherwise). */
  readonly allowedRoot?: string;
  /** When set, idle univerfiles with no live connections are evicted after this many ms. */
  readonly idleTtlMs?: number;
  /** Factory for the per-file authority; injectable so tests can avoid booting real Univer. */
  readonly createCollab?: (dbPath: string, create: boolean) => CollabService;
}

interface UniverfileEntry {
  readonly univerfile: Univerfile;
  lastAccessMs: number;
}

/**
 * Stateless, per-`univerfile` addressing. No default univerfile: every request carries its
 * `univerfile`, normalized (local `realpath`) to a single-writer identity and lazily backed
 * by a resident SDK-backed `CollabService`, cached by identity and optionally evicted
 * when idle. Same file via different spellings (relative / symlink) -> one authority.
 */
export class UniverfileManager {
  private readonly _univerfiles = new Map<string, UniverfileEntry>();
  private readonly _allowedRoot: string | undefined;
  private readonly _idleTtlMs: number | undefined;
  private readonly _createCollab: (dbPath: string, create: boolean) => CollabService;
  private _evictTimer: ReturnType<typeof setInterval> | undefined;

  public constructor(options: UniverfileManagerOptions = {}) {
    this._allowedRoot =
      options.allowedRoot === undefined ? undefined : normalizePath(options.allowedRoot);
    this._idleTtlMs = options.idleTtlMs;
    this._createCollab =
      options.createCollab ?? ((dbPath, create) => new CollabService({ dbPath, create }));

    if (this._idleTtlMs !== undefined && this._idleTtlMs > 0) {
      const ttl = this._idleTtlMs;
      this._evictTimer = setInterval(() => this.evictIdle(ttl), ttl);
      this._evictTimer.unref();
    }
  }

  /** Open an EXISTING univerfile; never creates. Throws `UniverfileNotFoundError` if the file is gone. */
  public openByPath(rawPath: string): Univerfile {
    const normalized = this._normalizeUniverfile(rawPath);
    this._evictIfDeleted(normalized);
    const existing = this._univerfiles.get(normalized);
    if (existing) {
      existing.lastAccessMs = Date.now();
      return existing.univerfile;
    }
    if (!existsSync(normalized)) {
      throw new UniverfileNotFoundError(`univerfile not found: ${normalized}`);
    }
    return this._open(normalized, false);
  }

  /**
   * Create a new univerfile `.univer` (auto-`mkdir -p` its parent dir), the ONLY operation that
   * creates a file. Throws `UniverfileExistsError` if it already exists.
   */
  public createUniverfile(rawPath: string): Univerfile {
    const normalized = this.prepareNewUniverfilePath(rawPath);
    mkdirSync(dirname(normalized), { recursive: true });
    return this._open(normalized, true);
  }

  /** Validate and normalize a new `.univer` path without creating or opening it. */
  public prepareNewUniverfilePath(rawPath: string): string {
    const normalized = this._normalizeUniverfile(rawPath);
    this._evictIfDeleted(normalized);
    if (this._univerfiles.has(normalized) || existsSync(normalized)) {
      throw new UniverfileExistsError(`univerfile already exists: ${normalized}`);
    }
    return normalized;
  }

  /** Decode a `base64url(univerfile)` key, then open the existing univerfile. */
  public resolveByKey(key: string): Univerfile {
    return this.openByPath(this._decodeKey(key));
  }

  /** Resolve an existing addressed path without opening its resident collaboration runtime. */
  public resolveExistingPathByKey(key: string): string {
    const normalized = this._normalizeUniverfile(this._decodeKey(key));
    this._evictIfDeleted(normalized);
    if (!existsSync(normalized)) {
      throw new UniverfileNotFoundError(`univerfile not found: ${normalized}`);
    }
    return normalized;
  }

  /** Decode a `base64url(univerfile)` key, then create the univerfile. */
  public createByKey(key: string): Univerfile {
    return this.createUniverfile(this._decodeKey(key));
  }

  /** Decode and validate a `base64url(univerfile)` key without opening or creating the file. */
  public assertAddressableByKey(key: string): void {
    this._normalizeUniverfile(this._decodeKey(key));
  }

  private _decodeKey(key: string): string {
    if (key.length === 0) {
      throw new UniverfileError("missing univerfile key");
    }
    const decoded = Buffer.from(key, "base64url").toString("utf8");
    if (decoded.length === 0) {
      throw new UniverfileError(`undecodable univerfile key: ${key}`);
    }
    return decoded;
  }

  private _normalizeUniverfile(rawPath: string): string {
    const abs = resolve(rawPath);
    if (extname(abs).toLowerCase() !== ".univer") {
      throw new UniverfileError(`univerfile must be a .univer path: ${rawPath}`);
    }
    const normalized = normalizePath(abs);
    this._assertWithinAllowedRoot(normalized);
    return normalized;
  }

  private _open(normalized: string, create: boolean): Univerfile {
    const univerfile: Univerfile = {
      path: normalized,
      collab: this._createCollab(normalized, create),
      events: new EventHub(),
    };
    this._univerfiles.set(normalized, { univerfile, lastAccessMs: Date.now() });
    return univerfile;
  }

  /**
   * Drop a cached univerfile whose backing `.univer` was deleted on disk out-of-band. Without this,
   * the resident authority (and its open SQLite handle) keeps serving the pre-deletion state on
   * reads and blocks re-creating the same path with `UniverfileExistsError`. Evicts unconditionally:
   * a deleted file is gone, so its authority is invalid even if connections remain.
   */
  private _evictIfDeleted(normalized: string): void {
    const entry = this._univerfiles.get(normalized);
    if (entry === undefined || existsSync(normalized)) {
      return;
    }
    this._univerfiles.delete(normalized);
    void entry.univerfile.collab.dispose();
  }

  public size(): number {
    return this._univerfiles.size;
  }

  public evictIdle(ttlMs: number): void {
    const now = Date.now();
    for (const [key, entry] of this._univerfiles) {
      if (now - entry.lastAccessMs <= ttlMs) {
        continue;
      }
      if (entry.univerfile.collab.hasConnections() || entry.univerfile.events.hasConnections()) {
        continue;
      }
      this._univerfiles.delete(key);
      void entry.univerfile.collab.dispose();
    }
  }

  public async dispose(): Promise<void> {
    if (this._evictTimer !== undefined) {
      clearInterval(this._evictTimer);
      this._evictTimer = undefined;
    }
    const disposals = [...this._univerfiles.values()].map((entry) =>
      entry.univerfile.collab.dispose(),
    );
    this._univerfiles.clear();
    await Promise.all(disposals);
  }

  private _assertWithinAllowedRoot(normalized: string): void {
    if (this._allowedRoot === undefined) {
      return;
    }
    const rel = relative(this._allowedRoot, normalized);
    if (rel.length === 0 || rel.startsWith("..") || isAbsolute(rel)) {
      throw new UniverfileError(`univerfile is outside the allowed root: ${normalized}`);
    }
  }
}

/**
 * Normalize a path to a stable single-writer identity by `realpath`-ing the deepest existing
 * ancestor and re-appending the not-yet-created tail. Stays consistent whether or not the
 * `.univer` exists yet (essential on macOS where /tmp is a symlink to /private/tmp).
 */
function normalizePath(rawPath: string): string {
  const abs = resolve(rawPath);
  const tail: string[] = [];
  let current = abs;
  for (;;) {
    try {
      const real = realpathSync(current);
      return tail.length === 0 ? real : join(real, ...tail);
    } catch {
      const parent = dirname(current);
      if (parent === current) {
        return abs;
      }
      tail.unshift(basename(current));
      current = parent;
    }
  }
}
