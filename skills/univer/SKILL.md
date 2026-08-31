---
name: univer
description: Create, inspect, edit, import, export, and hand off multi-Unit .univer files through DSH tools and isolated worktrees. Use proactively for any task involving .univer files, spreadsheets or .xlsx/.csv/.tsv data, presentations or .pptx slides, .docx documents, Base databases, Board canvases, cross-Unit content, or exact Univer Facade API authoring; load this before the matching Unit skill.
---

# Univer files

Use the structured `univer_*` tools whenever the task creates, reads, changes, converts, or reviews office content. Do not wait for the user to name a tool. Do not invoke a global `univer` CLI, edit `.univer` storage directly, or substitute openpyxl, python-pptx, python-docx, ZIP manipulation, or another writer.

## Start immediately

- Existing `.univer`: call `univer_status` before selecting a Unit or worktree.
- New `.univer`: call `univer_new`, then `univer_worktree` with `action: "create"`.
- Office source (`.xlsx`, `.csv`, `.tsv`, `.docx`, `.pptx`): create the target `.univer` and draft worktree, then call `univer_import`.
- Before authoring content, load the matching Unit skill: `univer-sheet`, `univer-doc`, `univer-slide`, `univer-base`, or `univer-board`.
- For an Embed, also load `univer-embed`. For formulas that read another Unit, also load `univer-cross-unit-formula`.

## Mental model

- A `.univer` file is the authoritative multi-Unit container. Each Sheet, Doc, Slide, Base, or Board is a top-level Unit with a stable `unitId`.
- Sheet names, pages, paragraphs, tables, ranges, shapes, fields, records, and views live inside a Unit; none substitutes for `unitId`.
- `trunk` is the reviewed main line. A worktree is an isolated scope for agent changes. There is no implicit current worktree.
- Every content write requires the complete address: `file`, draft `worktreeId`, and `unitId`.
- `univer_execute` persists only when Facade mutations occurred. A read-only execution produces no revision.
- `ready` rejects writes until `reopen`. `merged` and `discarded` are terminal; never reuse them.
- Tool success is not correctness evidence. Read the changed model back and verify task-specific assertions.

## SVG resources

When a Unit needs icons, logos, emoji, or illustrations, use the bundled resource library instead of inventing placeholders:

1. Call `univer_resources` with `action: "registries"` when registry choice matters.
2. Call `univer_resources` with `action: "find"` and one or more semantic `queries`; retain the exact returned handles.
3. Call it with `action: "export"`, those `handles`, and an explicit workspace `output` directory.
4. Reference the exported SVG files from Slide SVG, or read one handle with `action: "read"` when inline SVG text is required.

Only `colorEditable: true` resources may follow an authored color. Fixed logos, color emoji, and illustrations keep their intrinsic colors. Reuse the exported file; do not copy partial path data from it.

## Facade API lookup

- No relevant class or API label is known: use `find` with API-name keywords or identifier fragments.
- A class is known: use `show` on the class to inspect its APIs.
- A type or exact `Class.member` API label is known: use `show` on that label for signatures, documentation, and examples.

`find` is case-insensitive. Each query is searched independently and returns its own matches; queries are not combined as AND, and `find` does not interpret intent. Pass a useful returned label to `show` instead of searching that label again.

## Required workflow

1. Call `univer_status` to discover Unit IDs and worktree states.
2. Create or select one draft worktree. Continue an existing worktree only after confirming its state.
3. Create a Unit with `univer_unit`, or import one with `univer_import`.
4. Load the matching Unit skill before writing Facade code.
5. Resolve unfamiliar Facade usage with `univer_api` following the lookup rules above. Never guess an unfamiliar signature, parameter type, or enum.
6. Mutate through `univer_execute`, or through `univer_compile_svg` for generated Slide page content.
7. Read the changed scope with `univer_inspect`; use a fresh read-only `univer_execute` when inspection omits a required model field.
8. For every changed Slide page, call `univer_lint` and resolve or explicitly justify each finding.
9. For visually relevant changes, call `univer_screenshot` with an explicit workspace output directory and the narrowest useful Unit-specific target. Inspect every returned image; screenshots complement rather than replace structural readback or Slide lint.
10. Export with `univer_export` only when requested and only from the verified scope.
11. Mark the worktree `ready` and confirm it with `univer_status`.

`univer_screenshot` returns model-visible PNG evidence and writes the same PNGs under its explicit `output` directory. It requires an image-capable current model route. The DSH client also renders live worktree content and the ready review panel from tool results; that preview remains the user-facing handoff surface because there is no model-facing show/open tool. Claim visual verification only for images actually inspected in the current result.

Merge or discard only when the user explicitly requests that outcome. Both operations change review state and are not routine completion steps.

## Rework after feedback

Continue in the same worktree only for changes to the same task and only after `univer_status` confirms that it is still `ready` or `draft`.

1. If it is `ready`, call `univer_worktree` with `action: "reopen"`.
2. If it is already `draft`, continue directly.
3. Make the remaining changes and repeat the complete readback and Unit-specific verification.
4. Mark it `ready` again and confirm the final status.

Never reopen or reuse a merged or discarded worktree; create a new worktree instead.

## Tool map

| Stage | Tool | Use |
| --- | --- | --- |
| Start | `univer_new` | Create an empty `.univer`; never overwrites and never creates an implicit Unit. |
| Start | `univer_status` | List trunk Units and worktrees, or inspect one explicit scope. |
| Start | `univer_worktree` | `create`, `ready`, `reopen`, `merge`, or `discard`. |
| Start | `univer_unit` | Create or remove a Sheet, Doc, Slide, Base, or Board in a draft worktree. |
| Start | `univer_import` | Import local xlsx, csv, tsv, docx, or pptx as a new Unit. |
| Write | `univer_execute` | Run version-matched Facade JavaScript against one Unit in a draft worktree. |
| Write | `univer_compile_svg` | Compile workspace SVG into one explicit Slide page with browser text metrics. |
| Verify | `univer_inspect` | Read structured Unit content from trunk or one worktree. |
| Verify | `univer_lint` | Check Slide text off-page, container escape, and text overlap. |
| Verify | `univer_screenshot` | Render Sheet, Doc, Slide, Base, or Board PNG evidence and return it to an image-capable model. |
| Reference | `univer_api` | Find an unknown name, or show a known class, API, or type. |
| Reference | `univer_resources` | List/find/read/export bundled SVG resources or clear their download cache. |
| Deliver | `univer_export` | Export Sheet/Base to xlsx/csv/tsv, Doc to docx, or Slide to pptx. |

## Facade execution

`univer_execute` injects `univerAPI`, `api` (the same object), and one Unit-specific handle:

- Sheet: `workbook`
- Doc: `doc`
- Slide: `presentation`
- Base: `base`
- Board: `board`

Do not redeclare injected variables. Use `code` only for a small snippet. For multi-line or reusable Facade logic, write a workspace JavaScript body file and pass it as `codeFile`; provide exactly one of `code` or `codeFile`.

Execution is Node ESM: `require` is unavailable, while dynamic `import()` and `Buffer` are available. For an explicit local workspace image, generate its data URI inside the execution instead of putting Base64 in the conversation:

```js
const { readFile } = await import("node:fs/promises");
const bytes = await readFile("/absolute/session/workspace/image.png");
const imageDataUri = `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
```

Read only task assets inside the session workspace. Do not print or return the data URI. Resolve exact Facade methods with `univer_api`, check boolean/null returns, and retain stable IDs needed by later operations.

## Import and export

- Import accepts workspace files only; URL import is unavailable.
- Export Sheet or Base to `.xlsx`, `.csv`, or `.tsv`; Doc to `.docx`; Slide to `.pptx`.
- Board export is unsupported.
- Export uses an explicit Unit and an explicit trunk or worktree scope. Recalculate formulas and finish readback before exporting.

## Unsupported CLI-only capabilities

Do not invent equivalents for CLI maintenance, daemon/configuration, `compile-typst`, optimization, or shell command help. Use the bundled DSH tools for resources and screenshots; if the task requires another missing capability, report that exact gap.

## Failure recovery

Tool failures use `Error [CODE]: message`. Route recovery by the code, not free text.

- For `GATEWAY_UNAVAILABLE` or `GATEWAY_REQUEST_TIMEOUT`, retry one `univer_status` read. After a write timeout, inspect status and content before continuing.
- For `FILE_PERMISSION_DENIED` or `SESSION_SCOPE_DENIED`, use an accessible in-workspace path or ask the user to correct access; do not retry the same path.
- For worktree or Unit state errors, refresh with `univer_status`; reopen `ready` worktrees and replace terminal ones.
