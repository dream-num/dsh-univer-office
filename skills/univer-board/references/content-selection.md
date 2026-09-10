# Selecting native Board content

Choose content from its purpose, not because every capability needs to appear in a diagram. A standalone chart,
sticky note, image or Ink edit does not need a relationship spec. Semantic payload keys below are authoring
conventions; translate them through the installed dedicated APIs.

## Chart, table, or Ink

| Use when                                                                             | Preserve in semantic `content`                                                      | Avoid                                                                                                                 |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Chart: communicate quantitative comparison, trend, distribution, or association      | `kind: "chart"`, analytical purpose, source data, field meanings, units, provenance | Inventing measurements, using a line to imply order in unordered categories, or replacing editable charts with images |
| Table: support exact lookup, comparison across common fields, or UML/ER compartments | `kind: "structured-table"`, columns and rows or named sections and items            | Converting every number into a chart, losing fields, or using a Board table as a spreadsheet calculation engine       |
| Ink: circle a risk, underline evidence, or add a freehand review mark                | `kind: "ink"`, annotation purpose, target via `annotates`                           | Replacing formal UML symbols, bound connectors, or essential text with strokes                                        |

For charts, categorical magnitude comparison suggests bars/columns, ordered numeric series can suggest a line,
and paired numeric observations can suggest a scatter plot. Query supported chart types before choosing one.
Preserve missing values as missing rather than zero, and keep units and aggregation explicit. Without authorized
data, ask for it or use clearly labeled illustrative data only when an example is appropriate; do not invent results
to decorate an architecture diagram. Chart plus table is useful when both overview and exact lookup are requested,
but keep their data consistent instead of generating independent numbers.

Use a native Board table for editable reference data and diagram compartments. If formulas or spreadsheet editing
are essential, inspect native Sheets embed support and report host limitations; a Board table is not an equivalent
fallback. Choose UML/ER table presets only for those semantics, not for every ordinary comparison table.

Ink is supplemental annotation, not a requirement for every diagram. An `annotates` relation identifies the subject;
its realization may be a native Ink circle or underline without an extra connector. Keep required explanations in
editable text, and create stroke geometry only after the target has its final bounds. Recheck clearance when the
target moves. A semantic annotation is not an automatic attachment: inspect grouping/containment support before
promising that strokes follow their subject. Standalone handwriting and small freeform notes may skip BoardSpec.

This mixed example requests exact values, a quantitative comparison, and a targeted review mark. `purpose`,
`columns`, `rows`, `data`, `units`, and `source` are semantic payload conventions here, not Facade parameter names.
The agent translates them through the installed dedicated APIs; no coordinates or chart-type enum are prescribed.

```json
{
  "schemaVersion": 1,
  "diagramType": "architecture",
  "title": "Agent evaluation workbench (illustrative data)",
  "nodes": [
    { "id": "evaluator", "label": "Evaluator", "semanticRole": "service" },
    {
      "id": "results",
      "label": "Exact evaluation results",
      "semanticRole": "evidence",
      "content": {
        "kind": "structured-table",
        "purpose": "Look up exact success rates",
        "columns": ["Strategy", "Success rate (%)"],
        "rows": [
          ["Tool use", 62],
          ["Planning", 78],
          ["Multi-agent", 84]
        ],
        "source": "Illustrative data, not measured benchmark results"
      }
    },
    {
      "id": "comparison",
      "label": "Success rate comparison",
      "semanticRole": "analysis",
      "content": {
        "kind": "chart",
        "purpose": "Compare success rates across strategies",
        "data": [
          ["Strategy", "Success rate (%)"],
          ["Tool use", 62],
          ["Planning", 78],
          ["Multi-agent", 84]
        ],
        "units": { "Success rate (%)": "percent" },
        "source": "Illustrative data, not measured benchmark results"
      }
    },
    {
      "id": "review",
      "label": "Review before drawing conclusions",
      "semanticRole": "annotation",
      "content": { "kind": "ink", "purpose": "Circle the comparison to flag it for review" }
    }
  ],
  "relations": [
    { "id": "produces", "from": "evaluator", "to": "results", "semantic": "produces" },
    { "id": "summarizes", "from": "comparison", "to": "results", "semantic": "summarizes" },
    { "id": "flags", "from": "review", "to": "comparison", "semantic": "annotates" }
  ]
}
```

Read back table cells and chart source values, not just element counts. Verify the annotation's target and native
Ink data, and capture readable content as well as the overview. If an API or provider is unavailable, retain the
intent and report the limitation; a generic rectangle is not evidence that the requested native element works.

## Media, resources and embeds

Use `content.kind` when an element participates in a larger semantic diagram:

- `structured-table`: realize as a Board table, including UML/ERD presets where applicable.
- `chart`: keep the data and analytical intent; realize with native `FBoard.newChart()` / `insertChart()`. Bind
  relations to `chart.getElementId()`, not its chart resource `getId()`. Check axis bounds and units visually;
  use a zero baseline for magnitude comparisons with bars, and label illustrative data as such.
- `image`: retain the asset reference and its purpose, then use `insertImage()`.
- `sticky`: use for an intentionally informal note. A cluster of unrelated sticky notes does not need BoardSpec.
- `external-resource`: retain the authorized source reference and relationship semantics; query the installed host
  and provider capabilities before choosing a link card, preview, or native embed.
- `embed`: use a native interactive child when editing is part of the intent. Query `FUniver.createEmbed`,
  `FEmbed.loadAsync`, and `FEmbedHostSurface.BoardFloating`; do not silently substitute an image or link card.
- `ink`: describe the annotation intent, not points or paths. Generate or edit strokes only during realization. For
  existing user ink, refer to its element ID instead of copying stroke geometry into the spec.

Native Board embeds are created through `api.createEmbed()`, not `board.insertShape()`. Supply the Board host unit,
`BoardFloating` surface, authorized source reference and child unit type; choose bounds during realization, not in
BoardSpec. Creation establishes the descriptor and host anchor, but does not prove the child can load. Await
`embed.loadAsync()` and verify the returned child, visible content and intended interaction. Report unavailable
plugins, unsupported sources, loading failures or access restrictions rather than claiming an empty anchor is a
working embed. Do not fetch unrelated content or broaden authorization to make a source load.

Use `embed.getHostAnchorId()` for Board connector endpoints and element inspection. `embed.getId()` identifies the
embed descriptor and `getChildUnitId()` identifies the child document; neither is the Board element ID. Keep these
IDs distinct in readback. Inspect `getDisplayTarget()` separately from the child's current selection/navigation;
local child navigation is not proof that the persisted display target changed.

The current native `BoardFloating` host is root-only: it does not support container/lane membership, rotation or
flips. If the spec requires such membership, report the unsupported mapping and resolve the requested structure;
visual enclosure is not a substitute for `parentId` / `laneId`. Query the installed contract before relying on a
newer capability. Test child editing and host move/resize/delete/undo when those interactions are part of the request.

## Native chart lifecycle

`FBoard.newChart` creates a builder; `build()` produces detached info, not a live chart. Insert with
`await board.insertChart(info)`, then read back through `board.getCharts()` / `board.getChart()`.
Use the returned live chart for updates: await `chart.setDataSource(values)` and asynchronous update methods,
and `await chart.remove()` for removal. Builder replacement and live setters are different contracts.
Use `chart.getElementId()` for Board bindings, not the chart resource ID. Inspect actual source values and rendered
axes; bar magnitude comparisons need a zero baseline. A successful insert is not proof the data is visible.

For registry image assets, inspect the installed resource find/export APIs, then pass supported image data to
`insertImage()` (SVG data URIs use `ImageSourceType.BASE64`). Preserve the original asset and aspect ratio.
