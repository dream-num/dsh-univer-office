# DSH × Univer Office

> Give DeepSeek Harness the ability to create, edit, inspect, and deliver spreadsheets, documents, presentations, databases, and canvases.

English · [简体中文](README.zh-CN.md)

[![npm](https://img.shields.io/npm/v/dsh-univer-office)](https://www.npmjs.com/package/dsh-univer-office)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.19-339933?logo=node.js&logoColor=white)](package.json)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

`dsh-univer-office` is the Univer office plugin for DeepSeek Harness (DSH). Tell the agent what you need and it can create or edit spreadsheets, documents, presentations, multidimensional tables, and canvases, or work with existing Excel, Word, and PowerPoint files. Every change is verified and stays in the conversation for you to preview, approve, or discard.

After installation, describe the result you want in natural language. The agent handles creation, editing, and verification while you follow the work live and review the result in the conversation. Deliver spreadsheets as Excel (`.xlsx`), documents as Word (`.docx`), and presentations as PowerPoint (`.pptx`) files when needed.

## See it in action

The agent created this spreadsheet from a natural-language request, then added conditional formatting and a chart in the same conversation. The result can be previewed, revised, merged into the current version, or discarded in place.

![Reviewing a spreadsheet with conditional formatting and a chart in DSH](docs/assets/readme/chart-and-formatting.png)

> **Deliver a standard Excel file:** after review, ask the agent to export the spreadsheet as `.xlsx` so it can be opened and edited in Excel, WPS Office, and other compatible office applications.

<details>
<summary>See the complete workflow from request to review</summary>

### 1. Describe the task in natural language

![Asking the agent to create a class score sheet](docs/assets/readme/spreadsheet-request.png)

### 2. Follow the result live while the agent works

![A live spreadsheet window while the agent works](docs/assets/readme/live-worktree.png)

### 3. Approve or discard the changes in the conversation

![The spreadsheet review card after the task completes](docs/assets/readme/review-result.png)

</details>

### Generate a presentation from one request

Give the agent a topic, audience, page count, content outline, and visual direction. It can build the complete presentation, verify content and layout page by page, and leave the result in the conversation for review.

![Reviewing a bubble sort teaching presentation in DSH](docs/assets/readme/presentation-review.png)

> **Deliver a standard PowerPoint file:** after review, ask the agent to export the presentation as `.pptx` so it can be presented and edited in PowerPoint, WPS Office, and other compatible office applications.

<details>
<summary>See the presentation workflow from request to finished deck</summary>

#### 1. Specify the topic, audience, and page requirements

![Asking the agent to create a bubble sort teaching presentation](docs/assets/readme/presentation-request.png)

#### 2. Follow and verify the pages while the agent works

![A live presentation window while the agent works](docs/assets/readme/presentation-live.png)

</details>

## What can it do?

- **Analyze and build spreadsheets** — read or create Excel data, clean fields, write formulas, apply formatting and validation, create tables, charts, pivots, filters, sparklines, conditional formatting, and images, then export the result as `.xlsx`, `.csv`, or `.tsv`.
- **Write and lay out documents** — create paragraphs, rich text, lists, tasks, tables, images, charts, headers, footers, pagination, and page layouts.
- **Create and revise presentations** — generate a deck from an outline, redesign selected pages, edit text, shapes, images, tables, charts, and transitions, then detect off-page, overflowing, and overlapping text.
- **Build lightweight databases** — create Base tables, fields, records, and views with formula fields, filters, sorting, grouping, and Sheet-backed references.
- **Draw editable canvases** — create shapes, text, connectors, images, native charts, and diagrams, with connector and layout analysis.
- **Compose several content types** — one `.univer` file can contain Sheet, Doc, Slide, Base, and Board Units. Formulas and embedded content can reference other Units in the same file.
- **Work with Office files** — import `.xlsx`, `.csv`, `.tsv`, `.docx`, and `.pptx`, then export the edited content in the matching format.
- **Review agent changes safely** — every write starts in an isolated worktree. Watch changes live, then merge or discard them from the conversation instead of letting the agent overwrite the current version.

### Example requests

```text
Create a simple payroll spreadsheet with employee, base salary, bonus, deduction, gross pay, and net pay columns. Calculate the totals automatically.

Create a six-slide lesson deck about bubble sort. Explain the concept, each comparison pass, pseudocode, and complexity, and check every page for layout problems.

Create a formal weekly project report with an executive summary, this week's progress, a risk table, next week's plan, headers, and footers, then export it as docx.

Create a customer-tracking Base with company, contact, stage, expected value, and next action fields, plus a view grouped by stage.

Create a sales Sheet and a summary Slide in the same .univer file, with the Slide chart reading the Sheet data.
```

## Capabilities

| Content | Create and edit | Verify and review | Import | Export |
| --- | --- | --- | --- | --- |
| Sheet | Cells, formulas, styles, tables, charts, pivots, filters, validation, images, and more | Structured range inspection, recalculation, range/workbook screenshots, live preview | `.xlsx` `.csv` `.tsv` | `.xlsx` `.csv` `.tsv` |
| Doc | Paragraphs, rich text, lists, tasks, tables, images, charts, headers, footers, pagination | Document readback, page screenshots, live preview | `.docx` | `.docx` |
| Slide | Pages, text, shapes, images, tables, charts, SVG layouts, transitions | Structure inspection, text bounds/overflow/overlap lint, page/contact-sheet screenshots, live preview | `.pptx` | `.pptx` |
| Base | Tables, fields, records, views, formulas, filters, sorting, grouping | Facade readback, workbench screenshot, live preview | — | `.xlsx` `.csv` `.tsv` |
| Board | Shapes, text, connectors, images, native charts, routing | Element and connector analysis, overview/region/element screenshots, live preview | — | — |

Every content type supports isolated worktree editing, review submission, reopening, merging, and discarding. Base and Board currently use exact Facade readback for structural verification. Board file export is not yet supported.

## Get started in 3 minutes

### 1. Install the plugin

If DSH is running, first press **Ctrl+C** in the terminal that started it. You can run the installation command while DSH is running, but the current DSH process will not load the new plugin automatically.

Install the plugin from npm:

```sh
dsh plugin --profile web add dsh-univer-office
```

Restart DSH after installation:

```sh
dsh web
```

After DSH starts successfully, refresh the existing DeepSeek Harness browser page with **Cmd+R / Ctrl+R**.

### 2. Describe the result you want

```text
Create reports/q2-review.univer. Read data/q2-sales.xlsx and build a management dashboard with summary metrics, monthly trends, and regional rankings.
```

The agent automatically loads the relevant skills and selects the `univer_*` tools. A typical task creates the file and a worktree, imports or creates a Unit, edits it, reads the result back for verification, and submits the worktree for review.

### 3. Review it in the conversation

- Creating a `.univer` file, creating or reopening a worktree, writing content, and submitting for review opens a live window in the top-right. A non-terminal worktree left open in one turn stays open in the next.
- Every touched `.univer` file that still exists at the end of the Turn uses the same foldable, fullscreen-capable Turn card; historical Turns keep the same card collapsed by default. Temporary files created and then removed during the Turn do not leave cards behind.
- Submit, merge, and discard through the full Univer page embedded in the card instead of duplicate controls outside the Viewer.

## How it works

A `.univer` file is a composable office container that can hold several Units of different types. The plugin puts each agent task in an isolated worktree:

```text
Your request
   ↓
Load the matching Univer skill
   ↓
Create / import / edit in a draft worktree
   ↓
Readback + recalculation + layout lint + PNG screenshot review
   ↓
Live preview and in-conversation review
   ↓
Revise / merge / discard
```

Only `merge` and `discard` end a worktree, and both require an explicit user request plus DSH approval. `ready` only submits the worktree for review; it does not change the trunk.

## Built-in tools

You do not need to call tools manually in normal use; DSH selects them from your request. This list shows what the plugin exposes to the agent.

| Tool | Purpose |
| --- | --- |
| `univer_new` | Create an empty `.univer` file without overwriting an existing file |
| `univer_status` | List Units and worktrees in trunk or a selected worktree |
| `univer_worktree` | Create, submit, reopen, merge, or discard an isolated worktree |
| `univer_unit` | Create or remove a Sheet, Doc, Slide, Base, or Board Unit |
| `univer_import` | Import an Office file as a new Unit |
| `univer_inspect` | Read document structure or a selected Sheet range |
| `univer_execute` | Read or modify content with the exact Univer Facade API |
| `univer_export` | Export a Sheet, Doc, Slide, or Base Unit |
| `univer_lint` | Detect off-page, overflowing, and overlapping Slide text |
| `univer_compile_svg` | Compile SVG into an explicit Slide page with real font metrics |
| `univer_screenshot` | Render Sheet, Doc, Slide, Base, or Board PNGs and return them to an image-capable model |
| `univer_api` | Search the exact Univer Facade API bundled with this plugin |
| `univer_resources` | Find, read, and export bundled SVG icons, logos, emoji, and illustrations, and manage their download cache |

The plugin also ships eight version-matched, lazily loaded skills: core orchestration, Sheet, Doc, Slide, Base, Board, Embed, and cross-Unit formulas.

## Preview and review experience

- **Live Univer window** — file creation plus worktree creation, reopening, writing, and submission open it automatically. Drag, resize, fold, or maximize it; non-terminal windows left open carry into the next Turn.
- **Unified Turn cards** — every touched `.univer` file that still exists has its own full Univer card, later reads do not erase a lifecycle result already produced in that Turn, and deleted temporary files do not leave loading cards behind.
- **Historical review** — draft, ready, merged, and discarded results all remain in the same card layout at their original Turn, with historical cards collapsed by default.
- **Session isolation** — each DSH session shows only its own windows, cards, and review state.
- **English and Chinese UI** — the plugin shell and every open Viewer follow the DSH locale.
- **Viewer import, export, and print** — a live trunk Viewer uses the Univer Ribbon to import Office files as new Units in the current `.univer`, export Sheet, Doc, Slide, or Base Units, and print supported Units. Protect and Print are unavailable in read-only Sheet Views. Worktree and merge-preview Views do not allow import or export; other supported Units can still print, and Board provides print only.
- **Sheet version history** — a live trunk Sheet exposes time-grouped versions in the Ribbon. Read-only review can inspect but not restore; an editable trunk lets the user explicitly restore a version. Worktree and merge-preview Views do not expose History.

## Requirements and current limits

- DeepSeek Harness and Node.js `>=22.19.0`.
- Slide layout lint, real SVG text measurement, and PNG screenshots require a local Chrome/Chromium executable. Set `UNIVER_RENDER_BROWSER` to use a specific browser path.
- Screenshots run only when the current model route declares image input. PNGs are saved under an explicit output directory in the session workspace and returned as model-visible attachments. Structural readback, Slide lint, and screenshots prove different facts; the live Viewer remains available for human review.
- Slide master pages, layout pages, and speaker notes are outside the current editing scope.
- Board mind maps, tables, ink, advanced editing, and file export are not yet supported.

## Configuration

The defaults are designed for local use: the Gateway starts on the first file-state request at `9080`. If that port is occupied, it tries `9081`, then continues upward one port at a time. Configure the bundle's Cordis layer when you need different values:

| Field | Default | Purpose |
| --- | --- | --- |
| `gatewayPort` | `9080` | Initial loopback port for the bundled Gateway; occupied ports advance by one |
| `autoStartGateway` | `true` | Start the Gateway on first use |
| `gatewayStartupTimeoutMs` | `10000` | Gateway startup timeout |
| `gatewayRequestTimeoutMs` | `3000` | State-read timeout |
| `gatewayMutationTimeoutMs` | `60000` | Gateway mutation timeout |
| `unitContentOperationTimeoutMs` | `120000` | Import, export, inspection, and execution timeout |
| `screenshotOperationTimeoutMs` | `120000` | Overall timeout for one browser screenshot operation |
| `screenshotMaxPages` | `30` | Maximum Doc or Slide pages rendered by one screenshot call |
| `screenshotMaxPixels` | `16777216` | Maximum pixel count for each screenshot image |
| `resourceCacheRoot` | `$DSH_HOME/cache/dsh-univer-office/resources` | Persistent downloaded-SVG cache; falls back to `~/.dsh` when `DSH_HOME` is unset |
| `resourceDownloadTimeoutMs` | `15000` | Timeout for one SVG resource download |
| `resourceOperationTimeoutMs` | `120000` | Overall timeout for one resource-library tool operation |
| `tools` | `true` | Register the `univer_*` tools |
| `skills` | `true` | Register the bundled Univer skills |

See [`src/host/config.ts`](src/host/config.ts) for the remaining cache and commit-confirmation options.

## Uninstall

```sh
dsh plugin --profile web remove dsh-univer-office
```

## Development

This project is a standard [DSH bundle](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/basic/publish.md). Its Host composes the Univer Service Provider, Tools Consumer, webServer Consumer, and Skill Provider. The bundle includes its Gateway, Viewer, headless Unit Content Worker, and Slide render machine. See the [architecture document](docs/architecture.md) for dependency directions and runtime boundaries.

```sh
pnpm install
pnpm run build
pnpm run test
```

Build the npm tarball and zip distribution:

```sh
bash scripts/build-dist.sh
```

`lib/`, `artifacts/`, `dist/`, `*.tgz`, and `univer-dsh-plugin.zip` are generated and are not committed.

## Official package name

Install only `dsh-univer-office`. The following similar names are deprecated npm placeholders reserved by this project to prevent impersonation; they contain no plugin code:

- `dsh-univer-plugin`
- `dsh-univer-office-suite`
- `dsh-univer-suite`
- `univer-office-suite`
- `univer-office`

## License

[Apache-2.0](LICENSE)
