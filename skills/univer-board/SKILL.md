---
name: univer-board
description: Create, edit, chart, inspect, and review Univer Board canvas Units through DSH tools and the Lite Interface. Use proactively for Board shapes, text, connectors, routing, images, native charts, diagrams, canvas layout, or any Board Unit task.
---

# Univer Board Units

Load `univer` first. Use an explicit draft worktree for writes and retain the Board `unitId` returned by `univer_unit`. Keep the selected `.univer` file and worktree scope throughout the task.

Use native editable Board elements to express the user's intent. Choose shape types, layout, spacing, colors, and
emphasis for the actual content; examples are not templates that every Board must follow.

## Start with the task

- Inspect an existing Board before editing; preserve unrelated content and deliberate manual layout.
- For a new relationship-heavy diagram, draft a compact [BoardSpec](references/board-spec.md) to preserve meaning
  before choosing geometry. Translate it through Facade APIs; it is not an SDK input or another persisted model.
- Direct edits, standalone charts, images, sticky notes, and freehand work can call their dedicated APIs without
  a spec. Do not invent graph relations just to use one.
- Read only the relevant reference below, relative to the skill directory supplied by DSH when it loads
  `univer-board`. Use the available file-reading tool for selected files; do not load every reference for ordinary tasks.

| Task                                                            | Read when needed                                     |
| --------------------------------------------------------------- | ---------------------------------------------------- |
| Relationship planning, semantic IDs and nesting                 | [BoardSpec](references/board-spec.md)                |
| Flowcharts, activity lanes, fork/join, composite states         | [Flow and state](references/flow-state.md)           |
| Lifelines, activation bars, messages and fragments              | [Sequence](references/sequence.md)                   |
| Class/ER compartments, relation ends and cardinalities          | [Class and ER](references/class-er.md)               |
| Use cases, component interfaces, deployment/package nesting     | [Structural UML](references/uml-structure.md)        |
| Mind maps, trees, timelines and family selection                | [Mind maps](references/mind-map.md)                  |
| Tables, charts, images, sticky notes, resources, embeds and Ink | [Content selection](references/content-selection.md) |
| Endpoint selection, routing diagnostics or animation            | [Connector routing](references/connector-routing.md) |
| Multiple texts, label sizing, wrapping or placement             | [Connector labels](references/connector-labels.md)   |
| Explicit multi-profile coverage or UI regression testing        | [Diagram review](references/diagram-review.md)       |

The profile narrows the search, not the design. Mix native primitives where the intent warrants it; no fixed node
size, layout direction, color palette, or animation count is required.

## Work through the installed API

Create a Board with `univer_unit` only when a new Unit is needed. Use `univer_inspect` with its `unitId`
for a read-only overview; pass exact `elementIds` for selected Board elements. Discover existing IDs before editing.

Use `univer_api` with `find` / `show` to query only the Facade methods/types needed for the next operation.
`univer_execute` predefines `univerAPI`, `api`, and the selected `FBoard` as `board`; do not redeclare them. The installed
SDK is authoritative: before a large batch, probe selected runtime methods/enums in a read-only call if their
availability is uncertain. An indexed type alone does not establish runtime support. Do not invent parameters or
upgrade dependencies to match a reference; report unavailable capabilities or explain a semantics-preserving fallback.

Run this code through `univer_execute` targeting the Board:

```js
const shape = board.insertShape({
  shapeType: api.Enum.ShapeTypeEnum.RoundRect,
  transform: { left: 80, top: 80, width: 180, height: 100 }
});
if (!shape) throw new Error("Cannot insert Board shape");
shape.getText().setText("Review");
return { shapeId: shape.getId(), elements: board.describeElements() };
```

`insertShape` takes geometry in `transform`, visual properties in `shapeData`, and text through the returned
live handle—not top-level `id`, coordinates, or `text`. Retain generated IDs and map semantic IDs to them.
Await asynchronous operations according to their installed signatures before dependent calls or readback.

Create and arrange nodes before their connectors. Use element-bound endpoints; for ordinary automatic connections,
start with `fromElementId` / `toElementId` and omit sides/routing overrides. Introduce explicit ports or routes for
diagram semantics or a diagnosed layout problem, not guessed pixel endpoints. Native map branches belong to their
layout owner. Sequence messages need the lifeline/activation rules in their reference.

Create known parents before children. Direct insertion into a parent uses parent-local coordinates;
`insertShapeAtPoint()` resolves a Board-world top-left point. Read back `parentId`, `laneId` and world bounds:
a shape drawn inside a box is not necessarily its child.

## Verify in proportion to the change

For a generated diagram, follow intent → spec when useful → layout decisions → Facade calls → check → targeted repair:

1. Read back persisted elements/text, ownership and bindings with `describeElements()`, `getElements()`, or
   type-specific inspection. Check the requested meaning, not only counts.
2. Run `board.analyzeModelLayout(48)`, then a full `univer_screenshot`. Inspect the image and
   each returned image's `metadata.layoutAnalysis`; headless analysis cannot establish final font metrics or automatic routes.
3. Repair implicated elements and recapture. Use [routing](references/connector-routing.md) or
   [label](references/connector-labels.md) guidance for their diagnostics. Never silently discard semantics to pass.
4. Hand off an overview and any needed readable details. Distinguish clean results, visually reviewed diagnostic
   exceptions, and blockers; command success alone is not visual verification.

For a localized edit, inspect the changed region and affected relationships; do not regenerate the Board or run
an unrelated profile matrix. Full drag/menu/Undo/Redo testing belongs to explicit interaction or coverage requests,
not every authoring task. A static screenshot does not prove UI behavior.

Call `univer_screenshot` with the selected `unitId`, `worktreeId`, and an authorized workspace `output`
directory. Use the DSH live Board preview for requested interaction or animation checks. Follow the
`univer` ready/status handoff; merge and discard remain user-authorized. Board Office export is unsupported.
