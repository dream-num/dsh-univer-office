# univerfile-sqlite

[English](README.md) | [简体中文](README.zh-CN.md)

`@univer/univerfile-sqlite` stores `.univer` files in SQLite through the built-in `node:sqlite`
driver. It owns the current schema, recognizes and upgrades older formats, and gives the
Collaboration SDK services the stores they persist through.

## Usage

```ts
import { openUniverfile } from '@univer/univerfile-sqlite'

const file = openUniverfile(path) // or openUniverfile(path, { create: true })
try {
  new UniverCollabService({ dbAdapter: file.trunk, runtime, logger })
  // file.worktree, file.history, and file.assets work the same way
} finally {
  await file.close()
}
```

`openUniverfile` returns a file in the current format (v3) or throws a `UniverfileError`. Opening
an older file upgrades it first and reports the result in `file.upgrade`. `:memory:` always
creates an in-memory file.

The handle exposes one store per functional area, matching the Collaboration SDK:

| Store      | Interface                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------- |
| `trunk`    | `IDatabaseAdapter`, plus `listUnits()` and `listUnitRecords()`                                |
| `worktree` | `IWorktreeDatabaseAdapter`, plus `listWorktrees()`, `listWorktreeUnits()`, `listDeletedUnits()`, and `deleteUnit()` |
| `history`  | `IHistoryDatabaseAdapter`                                                                     |
| `assets`   | `store()`, `open()`, and `publishWorktreeAssets()` for content-addressed embedded assets      |

The SDK services call the contract methods; the application calls the extensions directly. A local
file does not support the SDK's revocable `setUnitRemoved`, which returns `INVALID_REQUEST`;
`worktree.deleteUnit()` removes a Unit from a Worktree instead. Application metadata reaches the
stores through the SDK call's `customData` under `UNIVERFILE_UNIT_METADATA_KEY`,
`UNIVERFILE_WORKTREE_METADATA_KEY`, and `UNIVERFILE_WORKTREE_CHANGE_METADATA_KEY`.

## Behaviour

- All stores of a handle share one SQLite connection. Keep one handle per path in a process.
- `close()` finalizes every statement before it closes the connection. Once it resolves, the file
  can be renamed or deleted, including on Windows.
- Processes that open the same file at once coordinate through SQLite's file locks, waiting up to
  5 s for a writer, and through an `.upgrade.lock` directory for upgrades. Only one of them upgrades.
- An upgrade identifies the format read-only, writes a byte-identical backup next to the file,
  converts a copy, verifies it, checks that the source did not change, and then replaces the
  source. Any failure before the replacement leaves the source unchanged and the backup in place.
  Reopening an unchanged file reuses its existing backup.
- Node 22 and 24 print an `ExperimentalWarning` when `node:sqlite` loads. The package leaves
  process warnings alone; start the process with `--disable-warning=ExperimentalWarning` to hide it.

## Formats

| Format | core | worktree | assets       | history      |
| ------ | ---- | -------- | ------------ | ------------ |
| v0     | no component version table | | |              |
| v1     | 1    | 1        | 1 or missing | 1 or missing |
| v2     | 1    | 2        | 1            | 1 or missing |
| v3     | 2    | 3        | 1            | 2            |

v3 is current. Unknown components, unknown versions, and mixed combinations are rejected with
`UNSUPPORTED_SCHEMA`.

## Layout

| Directory  | Responsibility                                                                            |
| ---------- | ----------------------------------------------------------------------------------------- |
| `driver/`  | The `node:sqlite` connection and transactions; the only module that imports the driver     |
| `codec/`   | JSON encoding of payload columns, including binary fields                                  |
| `schema/`  | The only definition of the current tables, indexes, and component versions                 |
| `stores/`  | Reads and writes on a current file; they never create tables                               |
| `upgrade/` | Everything about older formats: detection, readers, backup, lock, verification, replacement |

Dependencies point down this list from `open.ts`: `upgrade/` builds on `schema/` and verifies
through `stores/`, `stores/` use `driver/` and `codec/`, and `schema/` describes only the current
format.

## Development

```sh
pnpm --filter @univer/univerfile-sqlite test
pnpm --filter @univer/univerfile-sqlite typecheck
```

Tests open files only through `openUniverfile`. `test/support/legacy.ts` builds older formats from
the frozen schemas in `test/fixtures/`.
