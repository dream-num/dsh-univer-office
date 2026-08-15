# DSH × Univer Plugin

[English](README.md) · [中文](README.zh-CN.md)

Preview Univer spreadsheets (and other units) directly inside DeepSeek Harness: after a turn that runs `univer` commands, a preview card automatically appears at the turn's tail — click it to expand fullscreen in-app, no browser or manual server needed.

```
┌────────────────────────────────────────┐
│ 📊 销售表格.univer  [wt-xxx]  [展开预览 ▾] │  ← card at the turn tail
│ /Users/.../销售表格.univer              │
└────────────────────────────────────────┘
```

## Features

- **Inline preview cards** — a card appears at the end of any turn whose bash calls mention a `.univer` file (worktrees supported via `--worktree`).
- **In-app fullscreen viewer** — click the card to open the sheet in an in-app iframe; close with ✕ / mask / Esc.
- **Daemon management** — green dot = daemon running; yellow dot = stopped, click to auto-start.
- **Multi-session** — each session shows its own turn's cards.
- **Bilingual UI** — the card follows the app locale (zh / en).

## Requirements

- macOS (or Linux) with DeepSeek Harness installed
- [univer-cli](https://github.com/dream-num/univer-cli) recommended: `npm i -g univer-cli`; without it the plugin still installs and prompts when needed

## Install

This is a standard [DSH bundle](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/basic/publish.md): it declares `dsh.bundle` and ships its own `cordis.patch.yml`, so it installs through the canonical loader:

### From a git checkout

```sh
dsh plugin --profile web add github:dream-num/dsh-univer-plugin
```

> npm publishing is planned for later; until then install from git or a local
> checkout.

### From a local checkout (development)

```sh
dsh plugin --profile web add /path/to/dsh-univer-plugin
```

> The first use of a profile initializes it; `dsh` appends the bundle to
> `dsh.profile.bundles` and pnpm links the package, so the loader resolves the
> plugin's `cordis.patch.yml` layer automatically. Verify with
> `dsh --profile web --dump-config` (you should see a `# == @univer-cli/dsh-univer-plugin` layer).

### Alternative: one-command installer (no dsh CLI)

If you cannot run the `dsh` CLI, a convenience installer is provided:

```sh
bash install.sh
```

Or for macOS users of the zip distribution: double-click `install.command` (see `packaging/INSTALL.txt`).

After any install: **refresh DeepSeek Harness (Cmd+R / Ctrl+R)**.

## Usage

1. Run `univer` commands in a session (`univer new/import/execute/inspect/...`)
2. When the turn ends, a preview card appears at its tail
3. Click the card → in-app fullscreen preview
4. If the daemon is not running, the card shows a yellow dot; click it to start the daemon

## Uninstall

```sh
univer-dsh uninstall
```

Or remove the plugin manually: delete `~/.dsh/profiles/node_modules/@univer-cli/dsh-univer-plugin` and the matching `cordis.patch.yml` entry.

## Architecture

This is a dual-half DSH plugin:

- **Node half** (`lib/index.js`) — a `dsh.client`-declared package; exposes an `univer` service and a loopback `/univer-api/*` HTTP route (status, ensure-daemon) on the host web server.
- **Client half** (`lib/client.js`) — hooks the `conversation.chat.turnTail` slot: scans bash tool calls in each turn for `.univer` targets and renders the preview card + fullscreen overlay.

## Development

`dist/` and the archives (`univer-dsh-plugin.zip`, `*.tgz`) are **generated** — they are gitignored and never committed. Source lives in `lib/`, `package.json`, `README*.md`, `cordis.patch.yml`, `install.sh`, and `packaging/`. After changing any source file, rebuild the artifacts:

```sh
bash scripts/build-dist.sh
```

This regenerates `dist/univer/` (the shipped package contents), the npm tarball `dist/univer-cli-dsh-univer-plugin-<version>.tgz`, and the zip distribution `univer-dsh-plugin.zip` (package contents + `install.command` + `INSTALL*.txt` from `packaging/`).

Publish the package with `npm publish` (respects the `files` allowlist); attach the zip/tgz to a GitHub Release for end users.

## Reserved npm name

The unscoped name [`dsh-univer-plugin`](https://www.npmjs.com/package/dsh-univer-plugin) is reserved by this project as a typosquatting guard — `redirects/dsh-univer-plugin/` holds a placeholder package (deprecated, pointing to the official name) that contains no code. **Always install the official package:**

```sh
dsh plugin --profile web add github:dream-num/dsh-univer-plugin   # until npm publish
dsh plugin --profile web add @univer-cli/dsh-univer-plugin        # after npm publish
```

## Metadata

- **Topic**: [`dsh-plugin`](https://github.com/topics/dsh-plugin)
- **Bundle manifest**: `dsh.bundle.patch` → `./cordis.patch.yml`
- **Client manifest**: `dsh.client` (`platform: "web"` + `inject`)

## License

[Apache-2.0](LICENSE)
