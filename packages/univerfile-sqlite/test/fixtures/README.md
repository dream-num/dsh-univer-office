# Fixtures

## Frozen schemas

`univerfile-v0.sql` and `univerfile-v2.sql` are the table layouts of the pre-collaboration CLI
(v0) and the pre-1.0.0 Gateway (v2). `test/support/legacy.ts` builds files from them for cases that
need precise or broken content, such as an inconsistent History index or an orphaned Worktree Unit.

## Files written by released CLIs

Each `.univer` file below was written by the published `univer-cli` release in its name, on
macOS with Node.js 24.14.0, by `generate-legacy.sh`:

1. import a two-row CSV as the Sheet Unit `Scores`;
2. add the Worktree `merged`, set `C1`, mark it ready, and merge it;
3. add the Worktree `draft`, set `B2`, and import a second CSV into it as the Unit `Stock`.

| File                          | Release | Format | Components                                  |
| ----------------------------- | ------- | ------ | ------------------------------------------- |
| `v0-univer-cli-0.3.8.univer`  | 0.3.8   | v0     | none (pre-collaboration tables)             |
| `v1-univer-cli-0.3.12.univer` | 0.3.12  | v1     | core 1, worktree 1                          |
| `v1-univer-cli-0.4.4.univer`  | 0.4.4   | v1     | core 1, worktree 1, assets 1                |
| `v2-univer-cli-0.5.0.univer`  | 0.5.0   | v2     | core 1, worktree 2, assets 1, history 1     |

The v0 and v1 releases also record the baseline import as a merged Worktree named
`import-baseline`. Regenerate a file with
`generate-legacy.sh <unpacked univer-cli package> <output.univer>` after installing the release's
production dependencies; the script runs the CLI with a throwaway `HOME` and stops its daemon.
