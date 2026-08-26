![Univer × DeepSeek](docs/assets/readme/univer-deepseek-banner.png)

# DSH × Univer Office

> Give DeepSeek Harness a real office environment.
>
> Univer Office Plugin brings spreadsheets, docs, slides, canvases, relational tables, and more into one runtime — with connected data, validation, versioned changes, and isolated worktrees for multi-agent collaboration.

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
- **Compose several content types** — one `.univer` file can contain Sheets, Docs, Slides, Bases, and Boards. Formulas and embedded content can reference other content in the same file.
- **Work with Office files** — import `.xlsx`, `.csv`, `.tsv`, `.docx`, and `.pptx`, then export the edited content in the matching format.
- **Review agent changes safely** — every write starts in an isolated draft. Watch changes live, then approve or discard them instead of letting the agent overwrite the current version.

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
| Base | Tables, fields, records, views, formulas, filters, sorting, grouping | Structured data checks, workbench screenshot, live preview | — | `.xlsx` `.csv` `.tsv` |
| Board | Shapes, text, connectors, images, native charts, routing | Element and connector analysis, overview/region/element screenshots, live preview | — | — |

Every content type supports isolated draft editing, review, revision, approval, and discarding. Base and Board support structural verification; Board file export is not yet supported.

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

### 3. Review it in the conversation

- Changes appear in a live, movable preview window while the agent works.
- Review cards remain in the conversation and can be folded or opened fullscreen later.
- Continue editing, approve, or discard changes from the Univer page embedded in the card.

## How it works

1. Describe the result you want and provide any source files.
2. The agent creates an isolated draft and edits the Univer content there.
3. Follow the live preview and ask for revisions until the result is ready.
4. Approve the result to update the current version, or discard the draft without changing it.

Approval and discarding always require an explicit user request.

## Built-in tools

DSH selects these tools automatically; you normally do not need to call them manually.

| Tool | Purpose |
| --- | --- |
| `univer_new` | Create an empty `.univer` file without overwriting an existing file |
| `univer_status` | View the content and draft status of a file |
| `univer_worktree` | Create, submit, revise, approve, or discard an isolated draft |
| `univer_unit` | Add or remove Sheet, Doc, Slide, Base, or Board content |
| `univer_import` | Import an Office file into a `.univer` file |
| `univer_inspect` | Read document structure or a selected Sheet range |
| `univer_execute` | Read or edit content through the Univer API |
| `univer_export` | Export Sheet, Doc, Slide, or Base content |
| `univer_lint` | Find off-page, overflowing, and overlapping Slide text |
| `univer_compile_svg` | Add an SVG layout to a Slide with measured text |
| `univer_screenshot` | Render supported content as PNG images for review |
| `univer_api` | Find bundled Univer API symbols by keyword and show exact references |
| `univer_resources` | Find and use bundled icons, logos, emoji, and illustrations |

## Preview and review experience

- **Live Univer window** — changes open automatically in a window you can drag, resize, fold, or maximize.
- **Conversation review cards** — each edited `.univer` file has its own full preview card, while deleted temporary files leave no stale cards behind.
- **Historical review** — drafts, submitted changes, approvals, and discarded results remain in the conversation, with older cards collapsed by default.
- **Session isolation** — each DSH session shows only its own windows, cards, and review state.
- **English and Chinese UI** — the plugin shell and every open Viewer follow the DSH locale.
- **Import, export, and print** — the current version can import Office files, export supported content, and print from the Univer Ribbon. Draft and review previews do not allow import or export; Board provides print only.
- **Sheet version history** — the current version shows time-grouped history in the Ribbon. Read-only views can inspect versions, while editable views can restore one explicitly.

## Requirements and current limits

- DeepSeek Harness and Node.js `>=22.19.0`.
- Some Slide layout checks and SVG text measurement require a local Chrome/Chromium executable. Set `UNIVER_RENDER_BROWSER` to use a specific browser path.
- Slide master pages, layout pages, and speaker notes are outside the current editing scope.
- Board mind maps, tables, ink, advanced editing, and file export are not yet supported.

## Configuration

The defaults are designed for local use: the service starts at port `9080`. If that port is occupied, it tries `9081`, then continues upward one port at a time. Set these plugin options when you need different values:

| Field | Default | Purpose |
| --- | --- | --- |
| `gatewayPort` | `9080` | Initial loopback service port; occupied ports advance by one |
| `autoStartGateway` | `true` | Start the service on first use |
| `gatewayStartupTimeoutMs` | `10000` | Service startup timeout |
| `gatewayRequestTimeoutMs` | `3000` | State-read timeout |
| `gatewayMutationTimeoutMs` | `60000` | Write-operation timeout |
| `unitContentOperationTimeoutMs` | `120000` | Import, export, inspection, and execution timeout |
| `screenshotOperationTimeoutMs` | `120000` | Overall timeout for one browser screenshot operation |
| `screenshotMaxPages` | `30` | Maximum Doc or Slide pages rendered by one screenshot call |
| `screenshotMaxPixels` | `16777216` | Maximum pixel count for each screenshot image |
| `resourceCacheRoot` | `$DSH_HOME/cache/dsh-univer-office/resources` | Persistent downloaded-SVG cache; falls back to `~/.dsh` when `DSH_HOME` is unset |
| `resourceDownloadTimeoutMs` | `15000` | Timeout for one SVG resource download |
| `resourceOperationTimeoutMs` | `120000` | Overall timeout for one resource-library tool operation |
| `tools` | `true` | Enable agent editing capabilities |
| `skills` | `true` | Enable bundled task guidance |

## Uninstall

```sh
dsh plugin --profile web remove dsh-univer-office
```

## Development

This project is a standard [DSH bundle](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/basic/publish.md). Its Host composes the Univer Service Provider, Tools Consumer, webServer Consumer, and Skill Provider. The bundle includes its Gateway, Viewer, headless Unit Content Worker, and Slide render machine. See the [architecture document](docs/architecture.md) for dependency directions and runtime boundaries.

The project requires Node.js `>=22.19.0` and `pnpm@11.23.0`.

```sh
pnpm install
pnpm run lint
pnpm run typecheck
pnpm run build
pnpm run test
```

## Official package name

Install only `dsh-univer-office`. The following similar names are deprecated npm placeholders reserved by this project to prevent impersonation; they contain no plugin code:

- `dsh-univer-plugin`
- `dsh-univer-office-suite`
- `dsh-univer-suite`
- `univer-office-suite`
- `univer-office`

## License

[Apache-2.0](LICENSE)
