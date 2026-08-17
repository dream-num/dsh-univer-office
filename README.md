# DeepSeek Harness (DSH) × Univer Plugin

> **Create, inspect, edit, and review Univer files inside DeepSeek Harness.**

[English](README.md) · [中文](README.zh-CN.md)

Create and preview Univer office files (sheets, docs, slides, bases) directly inside DeepSeek Harness. After a turn uses a structured `univer_*` tool, a preview card appears at the turn tail; click it to expand fullscreen in-app. Worktree work gets a live window, and session-end review stays inside the conversation.

```
┌────────────────────────────────────────┐
│ 📊 sales.univer  [wt-xxx]  [Expand ▾]  │  ← card at the turn tail
│ /Users/.../sales.univer                │
└────────────────────────────────────────┘

┌──────────────────────────────┐
│ ● agent-draft · sales.univer │  ← floating live window (draft worktree)
│ [in progress]  [−] [⤢] [✕]  │
│ ┌──────────────────────────┐ │
│ │   live worktree Viewer   │ │     click the bar to enlarge,
│ │   (read-only, real-time) │ │     drag / fold / dismiss anytime
│ └──────────────────────────┘ │
└──────────────────────────────┘

┌────────────────────────────────────────┐
│ 🧾 Merge preview「agent-draft」 [Ready] ▾ │  ← session-end merge panel
│ ┌────────────────────────────────────┐ │
│ │   merge preview page (embedded)    │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

## Features

- **Inline preview cards** — a card appears at the end of turns that use the structured `univer_*` tools.
- **In-app fullscreen viewer** — click the card to open the sheet in an in-app iframe; close with ✕ / mask / Esc.
- **Live floating worktree window** — when the agent creates or updates a worktree, a small window pops up in the **top-right corner** embedding the live read-only worktree page. Edits appear in real time. When one worktree touches several units (e.g. a sheet plus a deck), the window and the review panel show **unit chips** that list ONLY changed units (＋ added / ✎ modified / － deleted / ⚠ conflict) with status icons, defaulting to the first one.
- **Window interactions** — drag the dark bar to move; click the bar (without dragging) to enlarge; `−` folds down to the bare title bar, `⤢` maximizes, **drag the bottom-right corner to resize**, `✕` dismisses until the worktree status changes.
- **Ready + session end → close, then merge panel** — once the session goes idle, every **non-terminal** worktree moves into the review dock below the conversation: `ready` shows the merge preview (`scope=mergePreview`) plus Discard / Merge into current version actions; **`draft` shows up too**, with the live worktree page plus Submit for confirmation / Discard actions (so a modification the agent forgot to submit is still reviewable). While the session is still running, non-terminal worktrees stay as top-right windows. **Merged or discarded worktrees (terminal states) show nothing — no window, no panel.**
- **Bundled Gateway management** — the plugin ships the collaboration Gateway and Viewer; green dot = running, yellow dot = stopped, click to start the plugin-owned Gateway.
- **Multi-session** — each session shows its own turn's cards, windows, and merge panels.
- **Bilingual UI** — the card follows the app locale (zh / en).

## Requirements

- DeepSeek Harness and Node.js 22.19 or newer; platform-native dependencies are installed from the registry for the current machine
- No global Univer CLI installation is required. The plugin bundles its Gateway, Viewer, headless Unit Content Worker, Office converter, Univer license, platform-native dependencies, and lazy Univer skills. It registers `univer_new`, `univer_status`, `univer_worktree`, `univer_unit`, `univer_import`, `univer_inspect`, `univer_execute`, `univer_export`, and `univer_api`.
- Model screenshot capture is intentionally not included yet. The bundled skill reports when appearance remains unverified instead of claiming visual confirmation.

## Install

This is a standard [DSH bundle](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/basic/publish.md): it declares `dsh.bundle` and ships its own `cordis.patch.yml`, so it installs through the canonical loader:

### From a git checkout

```sh
dsh plugin --profile web add github:dream-num/dsh-univer-office
```

### From npm

```sh
dsh plugin --profile web add dsh-univer-office
```

### From a local checkout (development)

```sh
dsh plugin --profile web add /path/to/dsh-univer-office
```

> The first use of a profile initializes it; `dsh` appends the bundle to
> `dsh.profile.bundles` and pnpm links the package, so the loader resolves the
> plugin's `cordis.patch.yml` layer automatically. Verify with
> `dsh --profile web --dump-config` (you should see a `# == dsh-univer-office` layer).

After any install: **refresh DeepSeek Harness (Cmd+R / Ctrl+R)**.

## Usage

1. Create an empty `.univer` file, then create an isolated worktree
2. Create a typed Unit or import an Office file into that draft worktree
3. Use the matching lazy Unit skill and `univer_api` when an exact Facade or method is needed
4. Modify with `univer_execute`, verify content with `univer_inspect`, and export only when requested
5. Submit with `ready`; use `reopen` when the same task needs another edit
6. Merge or discard only on an explicit request and after DSH approval; the in-app review panel provides the same decisions
7. Preview cards, the live worktree window, and the session-end review panel reflect the structured tool results

## Uninstall

```sh
dsh plugin --profile web remove dsh-univer-office
```

## Architecture

The package is one installable DSH bundle with several internal Cordis roles:

- the root Host plugin composes the Univer Service Provider, webServer Consumer, Tools Consumer, and bundled lazy Skill Provider;
- `ctx.univer` is the only Host domain API used by the consumers;
- `host/webServer` exposes `GET /univer-api/status`, `POST /univer-api/gateway/start`, `GET /univer-api/state`, and `POST /univer-api/worktree-action`;
- the Tools Consumer exposes domain tools instead of a generic CLI passthrough;
- `host/processes/gateway` owns the bundled Gateway process and Viewer assets; `host/adapters/unit-content` starts an isolated one-shot Unit Content Worker from `workers/unit-content` for import, inspect, execute, and export;
- the Client recovers structured targets from durable tool events, polls state through its API layer, and renders preview, live-window, and review components.

`src/` contains the hand-written Host, Client, Gateway application, and Unit Content Worker sources. `lib/`, the Gateway executable, and the Worker executable are generated and gitignored; only the prebuilt Viewer remains a checked-in runtime asset. See [the architecture decision](docs/architecture.md) for directories, dependencies, and trust boundaries.

## Development

`lib/`, the Gateway and Worker executables, `dist/`, and the archives (`univer-dsh-plugin.zip`, `*.tgz`) are **generated** and never committed. `pnpm run build` compiles all three applications from `src/`; the Viewer bundle under `vendor/collaboration/artifacts/viewer` is the only checked-in runtime artifact.

```sh
pnpm run build
pnpm run test
```

Then build the release artifacts:

```sh
bash scripts/build-dist.sh
```

This regenerates `dist/univer/` (the shipped package contents), the npm tarball `dist/univer-office-<version>.tgz`, and the zip distribution `univer-dsh-plugin.zip` (package contents).

Individual smoke tests:

```sh
node test/host-smoke.mjs
node test/client-smoke.mjs
node test/skills-smoke.mjs
npm run test:integration
```

Publish the package with `npm publish` (respects the `files` allowlist); attach the zip/tgz to a GitHub Release for end users.

## Reserved npm names

The following unscoped names are reserved by this project as typosquatting guards — each `redirects/<name>/` directory holds a placeholder package (deprecated, pointing to the official name) that contains no code:

- [`dsh-univer-plugin`](https://www.npmjs.com/package/dsh-univer-plugin)
- `dsh-univer-office-suite`
- `dsh-univer-suite`
- `univer-office-suite`
- `univer-office`

**Always install the official package:**

```sh
dsh plugin --profile web add github:dream-num/dsh-univer-office   # from git
dsh plugin --profile web add dsh-univer-office                    # from npm
```

## Metadata

- **Topic**: [`dsh-plugin`](https://github.com/topics/dsh-plugin)
- **Bundle manifest**: `dsh.bundle.patch` → `./cordis.patch.yml`
- **Client manifest**: `dsh.client` (`platform: "web"` + `inject`)

## License

[Apache-2.0](LICENSE)
