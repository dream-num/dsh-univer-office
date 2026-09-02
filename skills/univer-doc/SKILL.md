---
name: univer-doc
description: Read, create, edit, paginate, chart, inspect, export, and review Univer Doc Units through DSH tools and the Lite Interface. Use proactively for paragraphs, rich text, lists, tasks, tables, images, charts, headers, footers, page layout, Traditional or Modern documents, docx import/export, and any Doc Unit task.
---

# Univer Doc Units

Load `univer` first. `univer_execute` provides `univerAPI`, `api` (the same object), and `doc` (the `FDocument` selected by `unitId`). Do not redeclare them. A Doc Unit does not provide `workbook` or `presentation`; if one appears undefined, verify the selected Unit type.

Select paragraphs with `doc.getParagraphs()` and `doc.getParagraph(paragraphId)`. Resolve exact signatures and enums with `univer_api`; do not guess or use Doc model internals.

## Model essentials

- A new Doc starts with one empty paragraph. Usually update it with `setText` or append with `doc.appendParagraph(text)`.
- Paragraph editing methods live on `doc`: `appendParagraph`, `insertParagraph`, `insertText`, and `deleteRange`.
- Paragraph IDs are stable across multi-step edits; indexes drift as content changes.
- `FDocumentParagraph` supports `getText`, `setText`, `appendText`, `setStyle`, and `getRange`.
- Lists and task helpers include `isListItem`, `isTask`, and `setTaskChecked`.
- Native charts use the direct `doc.newChart()`, `doc.insertChart()`, `doc.getCharts()`, and
  `doc.getChart()` methods.
- Colors must use `#RRGGBB`. Docs do not support formulas or recalculation.

## Data stream

The body is one `dataStream` string. Paragraphs are separated by `\r`, and the document ends with `\r\n`. `body.paragraphs[i].startIndex` identifies the terminating `\r`; offsets passed to `insertText`, `deleteRange`, and text-style operations address this stream. Preserve paragraph terminators.

## Paragraph and text styles

Pass paragraph properties and `textStyle` together to `paragraph.setStyle` when the entire paragraph shares one style. Query `IParagraphStyle` rather than guessing enum values.

```js
const paragraph = doc.appendParagraph("Section Title");
const changed = paragraph.setStyle({
  namedStyleType: api.Enum.NamedStyleType?.HEADING_1 ?? "HEADING_1",
  textStyle: { bl: api.Enum.BooleanNumber.TRUE },
});
if (!changed) throw new Error("paragraph style update failed");
```

Important paragraph fields include `horizontalAlign`, `namedStyleType`, `headingId`, `indentStart`, and `indentFirstLine`. Text style uses compact fields such as `bl`, `it`, `cl: { rgb }`, and `bg: { rgb }`. Later style writes can replace earlier fields, so merge base font family, size, spacing, and color with local overlays deliberately.

## Native images

Use a stable Base64 data URI for local reproducible authoring. In the headless authoring runtime, always provide both width and height. Set wrapping explicitly and use a body range rather than a transient selection.

```js
const anchor = doc.getParagraphs()[0];
if (!anchor) throw new Error("image anchor missing");
const range = anchor.getRange();
const image = await doc.insertImage({
  source: imageDataUri,
  imageSourceType: api.Enum.ImageSourceType.BASE64,
  width: 320,
  height: 180,
  wrappingStyle: api.Enum.DocsImageWrappingStyle.INLINE,
  textRange: {
    startOffset: range.startOffset,
    endOffset: range.startOffset,
    collapsed: true,
    segmentId: anchor.getSegmentId(),
  },
});
if (!image) throw new Error("image insert failed");
```

Use `INLINE` for normal content, `WRAP_SQUARE` or `WRAP_TOP_AND_BOTTOM` when text should reflow, and reserve `BEHIND_TEXT` / `IN_FRONT_OF_TEXT` for intentional overlays. Never persist temporary signed URLs, install global image polyfills, or write drawing storage directly. Verify `doc.getImages()` and docx export when requested.

## Document flavor and pagination

Check `doc.getDocumentFlavor()` or `doc.isTraditional()` before page-specific work. A new Doc is Modern and pageless. Traditional section/page APIs reject Modern Docs; do not simulate pages with large spacers.

For a Traditional Doc, insert a hard page boundary with one atomic section command:

```js
if (!doc.isTraditional()) throw new Error("Traditional Doc required for physical pagination");
const chapter = doc.findParagraphByText("Chapter 2");
if (!chapter) throw new Error("chapter heading missing");
const section = doc.insertSectionBreak(chapter.getInfo().startOffset, {
  nextSectionType: api.Enum.SectionType.NEXT_PAGE,
});
if (!section) throw new Error("section break insert failed");
```

Use `section.getEffectivePageSetup()` for resolved geometry. `keepNext`, `keepLines`, and `widowControl` improve natural pagination but do not create hard breaks.

## Tables and layout

For fixed columns in a Traditional Doc, prefer a borderless layout table. Real data tables must define column widths, header rows, merges, and borders explicitly.

```js
const table = doc.insertTableFromData(
  [["Group", ""], ["Name", "Description"], ["A", "Long description"]],
  { width: 602, columnWidths: [200.667, 401.333], headerRowCount: 2 }
);
if (!table) throw new Error("table insert failed");
table.mergeCells({ startRow: 0, endRow: 0, startColumn: 0, endColumn: 1 });
table.setHeaderRowCount(2);
table.setTableBorder({
  preset: api.Enum.DocsTableBorderPreset.None,
  color: "#FFFFFF",
  width: 0,
});
```

Constrain cell-local paragraph edits with `table.getCellContentRange(row, column)` and confirm the target text. Do not search duplicate text globally and broadcast a mutation. The public Facade has no verified dynamic current-page field, table-cell padding mutation, or cell vertical-alignment mutation; report these gaps instead of faking them.

## Native charts

Create detached chart information directly from `doc`, then insert it to obtain a live
`FDocumentChart`. Query `FDocument.newChart`, `FDocument.insertChart`, `FDocument.getCharts`,
`FDocument.getChart`, `FDocumentChartBuilderOf`, and `DocsChartInsertAnchorKind` before authoring.

```js
const info = doc
  .newChart(univerAPI.Enum.ChartTypeString.Column)
  .setTitle({ text: "Quarterly Revenue" })
  .setSource([
    ["Quarter", "Revenue"],
    ["Q1", 12],
    ["Q2", 18],
    ["Q3", 15],
  ])
  .setCategoryField(0)
  .setValueFields([1])
  .setPosition({ kind: univerAPI.Enum.DocsChartInsertAnchorKind.BodyOffset, offset: 0 })
  .setInline()
  .setSize(480, 320)
  .build();
const inserted = await doc.insertChart(info);
return { chartId: inserted.getId(), drawingId: inserted.getDrawingId(), info: inserted.getInfo() };
```

`doc.getCharts()` and `doc.getChart(id)` return live charts. Await
`chart.setDataSource(values)` for data changes. For a complete replacement, use
`chart.toBuilder().build()` and `await chart.update(info)`. Remove it with `await chart.remove()`
and check the boolean. Await every asynchronous mutation before execution returns. Verify in a
fresh read-only execution with
`doc.getCharts().map((item) => ({ id: item.getId(), drawingId: item.getDrawingId(), type: item.getType(), info: item.getInfo() }))`.

## Inspect and verify

After each mutation:

1. Call `univer_inspect` for the document overview and relevant paragraph/range when supported.
2. Use a fresh read-only `univer_execute` to confirm full paragraph text/order, stable IDs, styles, lists/tasks, table dimensions, image identities, chart descriptions, document flavor, section breaks, headers, footers, and page setup required by the task.
3. Call `univer_screenshot` with the Doc `unitId`, selected worktree or trunk, and an explicit workspace `output` directory. Inspect every returned page PNG for wrapping, physical pagination, image placement, and layout failures. Logical inspection alone cannot prove these facts.
4. If `.docx` delivery is requested, call `univer_export` only after structural readback succeeds.
5. Follow the `univer` ready/status handoff workflow.

`compile-typst` is not available in this plugin. Do not reproduce it with unrelated converters.
