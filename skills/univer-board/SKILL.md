---
name: univer-board
description: Create, edit, chart, inspect, and review Univer Board canvas Units through DSH tools and the Lite Interface. Use proactively for Board shapes, text, connectors, routing, images, native charts, diagrams, canvas layout, or any Board Unit task.
---

# Univer Board Units

Load `univer` first. Create the Board with `univer_unit` in a draft worktree and retain its `unitId`. `univer_execute` provides `univerAPI`, `api`, and the selected `FBoard` as `board`; do not redeclare them.

Resolve exact methods with `univer_api`, especially `FBoard.insertShape`, `FBoard.insertShapes`,
`FBoard.arrangeElementsInLayers`, `FBoard.insertConnector`, `FBoard.insertConnectors`, `FShape`,
`FBoard.newChart`, `FBoard.insertChart`, `FBoard.getCharts`, and `FBoard.getChart`.

```js
const shape = board.insertShape({
  shapeType: api.Enum.ShapeTypeEnum.RoundRect,
  transform: { left: 80, top: 80, width: 180, height: 100 },
});
if (!shape) throw new Error("Cannot insert Board shape");
shape.getText().setText("Review");
return { shapeId: shape.getId(), elements: board.describeElements() };
```

`insertShape` accepts `IShapeCreateInput`: geometry belongs in `transform`, visual data belongs in `shapeData`, and text is edited through the returned live handle. It does not accept top-level `id`, `left`, `top`, `width`, `height`, or `text`. Retain generated IDs immediately.

Use `board.getElements()`, `board.describeElements()`, or `board.save()` for persisted model readback.

Call `univer_inspect` without a selector for an overview of ordered elements, counts, bounds, relationships, and text summaries. Pass one or more exact IDs in `elementIds` for type-specific detail without loading the full Board snapshot. Both forms are read-only; use them before editing to discover existing IDs and after editing to verify persisted structure.

## Connectors and layout verification

Create and arrange related shapes before creating their connectors. Use nodes at least `160 × 80` unless the content requires more room. For Mermaid-like flowcharts, prefer `arrangeElementsInLayers(layers, { direction })`; its `140` layer gap and `100` item gap defaults leave usable terminal and branch corridors. Do not compress gaps merely to reduce screenshot size.

Prefer generated element IDs and element-bound endpoints. For an ordinary relationship, omit `side`, `routing`, and `routingMode`: facade planning chooses facing sides, persists `straight` for an aligned unobstructed corridor, and otherwise persists automatic `orthogonal` routing with `miter` corners. Explicit routing reproduces requested geometry: use `curve` only for a deliberate self-loop or a short feedback arc with a visibly clear sweep, and `freePolyline` only for requested manual geometry. Do not use rounded orthogonal corners when a terminal leg or corridor is narrow.

Branch endpoints need deliberate port separation. On one source side, order normalized `position` values by target geometry, such as `0.25` for the upper branch and `0.75` for the lower branch. Reuse a position only for an intentional shared port. Keep feedback edges on an outer lane, use sites facing that lane, and prefer explicit orthogonal miter waypoints when a curve would cross the main flow.

```js
const shapes = board.insertShapes([
  {
    shapeType: api.Enum.ShapeTypeEnum.RoundRect,
    transform: { left: 80, top: 80, width: 180, height: 100 },
  },
  {
    shapeType: api.Enum.ShapeTypeEnum.RoundRect,
    transform: { left: 400, top: 80, width: 180, height: 100 },
  },
]);
if (!shapes) throw new Error("Cannot insert Board shapes");
const source = shapes[0];
const target = shapes[1];
if (!source || !target) throw new Error("Expected two Board shapes");
if (
  !board.arrangeElementsInLayers([[source.getId()], [target.getId()]], {
    direction: "horizontal",
    start: { x: 80, y: 80 },
  })
)
  throw new Error("Cannot arrange Board shapes");
const connectors = board.insertConnectors([
  {
    start: { elementId: source.getId() },
    end: { elementId: target.getId() },
    style: { endMarker: { type: "filledTriangle", size: "md" } },
  },
]);
if (!connectors) throw new Error("Cannot insert Board connectors");
const analysis = board.analyzeModelLayout(48);
if (!analysis) throw new Error("Cannot analyze Board layout");
return { connectorIds: connectors.map((item) => item.id), analysis };
```

Treat `element-overlap`, `connector-through-element`, `connector-collinear-overlap`, and `connector-terminal-direction-reversed` as blocking. Treat `connector-crossing` and `connector-excessive-detour` as warnings that still need local review. A reversed terminal means the rendered line approaches a bound endpoint against its outward normal; an excessive detour means an orthogonal route is over three times the direct distance with material extra length. Fix endpoint sides, spacing, or the outer lane instead of accepting either result. Model analysis deliberately reports an auto connector without persisted route points as unresolved. Do not infer that it is clear: browser rendering owns its final route.

Endpoint lint applies to every Board connector, not only sequence diagrams. `connector-free-endpoint-near-element` means a free start/end lies within the normal snap threshold of a connectable element. Repair the endpoint with `board.setConnectorConnection()`: use the existing shape-site or shape-boundary endpoint contract for ordinary shapes. A `connector-free-endpoint-near-dashed-connector` warning means a horizontal message-like endpoint is using a vertical dashed connector as a likely fake lifeline. Rebuild that participant with `api.Enum.BoardSequenceShapeType`, then patch the reported start or end with `{ kind: "lifeline", shapeId, offsetY }`. Both are analysis warnings, not insertion parameter errors. `normalizeConnectorRouting()` does not repair endpoint semantics and must not substitute for rebinding them.

Specify connector intent, marker type/size/offset, and routing mode; do not hand-calculate arrow depth or terminal-leg length. Render geometry accounts for marker paint bounds, stroke width, endpoint gap, rounded corners, and dash phase. For orthogonal auto connectors without manual waypoints or route points, the router reserves marker-aware terminal space without changing the connector type. Imported or explicitly manual routes keep their topology: rendered lint reports `connector-marker-target-overlap`, `connector-marker-corner-overlap`, `connector-marker-collision`, `connector-terminal-direction-reversed`, `connector-excessive-detour`, `connector-terminal-stem-too-short`, or `connector-terminal-dash-discontinuity` when their visual configuration does not fit. Treat marker target/corner overlap and marker collision as errors; review detour, terminal stem, and dash continuity warnings instead of repeatedly normalizing the route. A stem warning in a very short direct corridor is a spacing problem: enlarge the gap or use a smaller marker; do not force a folded route into the same corridor.

Run a full `univer_screenshot` to materialize the renderer. Read its returned `layoutAnalysis`, not the model's unresolved route, as the final routing evidence. Every rendered issue includes `connectorIds`, `elementIds`, `bounds`, and a padded `focusBounds` ready for the next screenshot `region`.

Collect the connector IDs named by rendered issues and call `board.normalizeConnectorRouting(["<connector-id>"])` at most once for that set. Connectors already using orthogonal auto routing are a safe no-op. The command preserves endpoints, labels, markers, style, container, and lane identity while resetting only route state. Re-run the full screenshot once and inspect its new `layoutAnalysis`; do not loop or move unrelated elements automatically. When connectors change, a non-null `affectedBounds` covers the old connector and both bound endpoint elements and can be passed directly as the screenshot `region`; a no-op returns `null`.

Use each remaining issue's `focusBounds` for readable evidence, or capture a connector together with its endpoint nodes through screenshot `elementIds`. Then finish with one full Board overview.

## Connector animation

Connector animation is off by default. When a diagram has a small number of important flows—roughly twelve or fewer animated connectors—and motion makes direction or activity easier to understand, prefer enabling animation instead of leaving every relationship visually identical. Keep dense diagrams static: animation is emphasis, not decoration.

Use `style.animation.mode` to choose the visual: `dash` moves a dash pattern, `particle` moves one dot, `pulse` highlights the full path, `gradient` moves a fading highlight, `particles` renders a repeated dot sequence, and `arrows` renders repeated directional arrowheads. `direction` is `forward` from connector start to end or `reverse`; it does not depend on marker placement and is ignored by `pulse`. `speed` is a positive multiplier; use `0.5`, `1`, or `2` for the floating menu's slow, normal, and fast presets. Use `board.setConnectorStyle(id, { animation: null })` to disable animation; omitting `animation` preserves its current value.

```js
const modes = ["dash", "particle", "pulse", "gradient", "particles", "arrows"];
const connectors = board.insertConnectors(
  modes.map((mode, index) => ({
    start: { kind: "free", x: 120, y: 100 + index * 80 },
    end: { kind: "free", x: 620, y: 100 + index * 80 },
    routing: "straight",
    style: {
      stroke: index % 2 === 0 ? "#0f766e" : "#b45309",
      strokeWidth: 3,
      endMarker: { type: "filledTriangle", size: "md" },
      animation: {
        mode,
        direction: index % 2 === 0 ? "forward" : "reverse",
        speed: index < 2 ? 0.5 : index < 4 ? 1 : 2,
      },
    },
    labelText: mode,
  })),
);
if (!connectors) throw new Error("Cannot insert animated connectors");
return connectors.map((connector) => ({
  id: connector.id,
  animation: board.getConnectorStyle(connector.id)?.animation,
}));
```

A still screenshot verifies geometry, labels, and persisted styles but cannot prove motion direction or speed. After model and rendered layout checks pass, review the DSH live Board preview for at least one full animation cycle. Confirm that markers remain static, moving effects follow rounded/curved paths, labels interrupt animated paint cleanly, and reverse arrows point along their actual travel direction.

## Images

Use user-provided workspace assets or the bundled SVG resource library. For bundled icons, logos, emoji, or illustrations, call `univer_resources` with `action: "find"`, then `action: "export"` into a workspace directory. Pass local SVG or bitmap data as a Base64 data URI to `board.insertImage()` with `ImageSourceType.BASE64`. Preserve intrinsic colors unless the resource reports `colorEditable: true`. Record the returned element ID and verify source type, bounds, and stacking order through a fresh read.

Do not use Unicode glyphs as a substitute for required icons or illustrations. Do not persist temporary signed URLs.

## Native charts

Native Board charts are owned directly by `FBoard`. Build detached chart information, then await
insertion to obtain a live `FBoardChart`:

```js
const info = board
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
  .setAbsolutePosition(80, 80)
  .setSize(640, 360)
  .build();
const inserted = await board.insertChart(info);
return { chartId: inserted.getId(), info: inserted.getInfo(), data: inserted.getDataSource() };
```

`board.getCharts()` and `board.getChart(id)` return live charts. Common setters update the live
chart; await `chart.setDataSource(values)` for data changes. For a complete replacement, use
`chart.toBuilder().build()` and `await chart.update(info)`. Remove it with `await chart.remove()`
and check the boolean. Await insertion, data updates, replacement, and removal before execution
returns.

Verify in a later read-only execution with
`board.getCharts().map((item) => ({ id: item.getId(), type: item.getType(), info: item.getInfo(), data: item.getDataSource() }))`,
confirming ID, count, type, title, position, size, and data.

## Verification

After every mutation:

1. Read back all relevant elements with `board.describeElements()` or `board.save()` in a fresh `univer_execute`.
2. Verify IDs, kinds, bounds, text, styles, stacking, connector endpoints/routing, image sources, chart descriptions, and any layout-analysis findings.
3. Review the DSH live preview for final route placement, clipping, marker paint, contrast, and overall canvas composition. Model readback alone cannot establish browser-routed geometry.
4. Call `univer_screenshot` for the full Board and inspect its returned metadata, including rendered connector layout analysis when present. For a defect, capture either its `focusBounds` as `region` or the connector and endpoint IDs as `elementIds`, with useful `padding` and `scale`, then inspect the focused PNG. Re-run one full overview after fixes.
5. Follow the `univer` ready/status workflow.

Mind maps, tables, ink, and advanced editing remain outside this Skill's verified authoring contract. Board export is unsupported; deliver the ready worktree preview.
