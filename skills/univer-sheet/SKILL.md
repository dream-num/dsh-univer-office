---
name: univer-sheet
description: Read, write, format, calculate, and verify Univer Sheet Units through DSH tools and the Lite Interface. Use proactively for spreadsheet values, formulas, ranges, tables, charts, images, formatting, validation, filters, pivots, rich text, xlsx/csv/tsv import or export, and any Sheet Unit task.
---

# Univer Sheet Units

Load `univer` first. `univer_execute` provides `univerAPI`, `api` (the same object), and `workbook` (the `FWorkbook` selected by `unitId`). Do not redeclare them. Execution is ESM and has no `require`.

Obtain a worksheet with `workbook.getActiveSheet()` or `workbook.getSheetByName("…")`. Use `getSheetName()`; `FWorksheet` has no `getName()`. Resolve unfamiliar APIs with `univer_api` before writing code.

## Cell model: v, t, f, and number formats

A cell is structured data: `{ v, t, f?, s? }`.

| Field | Meaning |
| --- | --- |
| `v` | Stored value used for calculation, comparison, and writeback. |
| `t` | Type: `1` text, `2` number, `3` boolean, `4` forced text. |
| `f` | Formula source; its cached result is stored separately in `v`. |
| `s.n.pattern` | Number format; changes display only, never `v`. |
| `p` | Rich text; when present it overrides the displayed form of `v`. |
| `si` | Shared-formula id; preserve only when deep-copying an existing formula cell. |
| `displayValue` | Visible text rendered from `v`, `t`, and number format. |

Always write explicit `ICellData`. Bare values are inferred and can corrupt identifiers, scores, leading zeros, and date-like strings:

```js
{ v: "text", t: 1 }
{ v: 42, t: 2 }
{ v: 1, t: 3 }
{ v: "00123", t: 4 }
{ f: "=A1+B1" }
{ v: "=A1+B1", t: 4 }
```

Dates, percentages, and currencies are numbers plus number formats:

```js
{ v: 44900, t: 2, s: { n: { pattern: "yyyy-MM-DD" } } }
{ v: 0.25, t: 2, s: { n: { pattern: "0%" } } }
```

Never write display text back as the stored value.

## Common APIs

- Ranges: `sheet.getRange("A1:C9")` or `getRange(row, col, numRows, numCols)`. Numeric rows and columns are zero-based.
- Sheets: `getActiveSheet()`, `getSheetByName("Sheet1")`, `getSheets()`.
- Authoritative reads: `getCellData()` / `getCellDatas()` for `v/t/f/s`; `getRawValues()` for unnormalized stored values.
- Presentation reads: `getDisplayValues()` for visible text and `getFormula()` for formula source.
- Writes: `setValue(cell)`, `setValues(grid)`, `setFormula("=…")`, `clearContent()`, and `clear()`.
- Dimensions: `getLastRow()`, `getLastColumn()`, and `setRowCount(n)` before out-of-range writes.
- Style: use explicit xlsx-safe colors in `#RRGGBB` or `rgb(r,g,b)` form.

`setValues()` merges cell data. `{}` or `{ s }` does not clear existing `v/f/p`. To replace a region, call `clearContent()` first, then `setValues()`. To clear one cell explicitly, set `{ v: null, f: null, p: null, si: null, custom: null }`.

## Over-grid images

Create an image with `sheet.newOverGridImage()`, set source, explicit size and position, await `buildAsync()`, then pass the built data to `sheet.insertImages()`:

```js
const sheet = workbook.getActiveSheet();
const image = await sheet
  .newOverGridImage()
  .setSource(imageDataUri, api.Enum.ImageSourceType.BASE64)
  .setColumn(1)
  .setRow(1)
  .setWidth(640)
  .setHeight(360)
  .buildAsync();
sheet.insertImages([image]);
```

Verify with `sheet.getImages()[0].toBuilder().getSource()` and `getSourceType()`.

## Formulas and recalculation

Formula source and cached result are separate. Writing a formula schedules calculation, but an immediate value read can still be stale. Loading a snapshot does not implicitly recalculate existing formulas.

Register `onCalculationResultApplied()` before triggering calculation, then await it:

```js
const calculated = api.getFormula().onCalculationResultApplied();
api.getFormula().executeCalculation();
await calculated;
return workbook.getActiveSheet().getRange("A3").getValue();
```

For a newly written formula, register the promise before `setFormula` and await it afterward. Recalculate before exporting because xlsx stores cached values with formulas. If only a final value is required and cache freshness cannot be guaranteed, write the stored value directly.

## OOXML table formulas

Use explicit Excel structured-reference scopes:

- `Orders[[#This Row],[Amount]]` or `Orders[@[Amount]]` reads one row value.
- `Orders[[#Data],[Amount]]` reads the complete data column.
- `Orders[Amount]` is valid, but prefer explicit `#Data` for whole-column aggregates.
- `[@[Amount]]` is valid only inside the Host table's calculated column.
- `table[Amount]` is invalid unless the real table name is exactly `table`.

Copy the exact table name from workbook metadata; do not use table id, Sheet tab name, display label, guessed case, or a placeholder. Await calculation, then verify both the stored formula and computed values.

## Rich text

Rich text lives in `cell.p`, not `cell.v`. Build it with `api.newRichText()`; never construct the internal body by hand.

```js
const rich = api.newRichText();
rich.insertText("Hello World");
rich.setStyle(0, 5, { bl: 1, cl: { rgb: "#FF0000" } });
workbook.getActiveSheet().getRange("A1").setRichTextValueForCell(rich);
```

`setStyle(start, end, style)` uses a half-open range. Derive offsets from inserted JavaScript strings. Common style fields are `bl`, `it`, `cl`, and `bg`. Verify `getCellData().p`, text-run ranges, and styles.

## Failure prevention

- Specify `t` for every non-formula cell written.
- Do not use `getValue()` or `getValues()` for authoritative reads; formatted values and booleans can be converted.
- Deep-copy complete cell data when copying formatted cells.
- After importing csv or tsv, inspect every column's value type and formulas before computing. Mixed values can cause an entire column to import as text.
- Sheet Unit name, worksheet name, and file name are different identifiers.
- Use `univer_api` before unfamiliar formatting, chart, table, filter, validation, pivot, image, comment, sparkline, or conditional-formatting operations.

## Verification

After every mutation:

1. Call `univer_inspect` with the exact `unitId`, worktree, and a range such as `Sheet1!A1:D20`.
2. Verify stored values, types, formulas, display values, row order, and task-specific calculations.
3. Read styles, number formats, rich text, images, charts, tables, or other omitted fields through a fresh read-only `univer_execute` call.
4. For visually relevant formatting, charts, images, or layout, call `univer_screenshot` with the exact `unitId`, worktree or trunk, a workspace `output` directory, and a narrow `range` plus optional `sheetName`. Inspect the returned PNG; use an unscoped full-workbook capture only when the task requires the complete workbook view.
5. Recalculate and re-read formula results before `univer_export`.
6. Follow the `univer` ready/status handoff workflow.
