# Connector label realization

Keep label geometry out of semantic BoardSpec. Relevant installed contracts are `IBoardConnectorLabel`,
`IBoardConnectorLabelLayout`, `BoardConnectorLabelSizing`, and the selected Facade label methods.

## Content and constraints

When the installed SDK supports the declarative layout contract:

- Store each independent text in `labels` with its own stable `id` and `content`. Plain text and rich documents are
  alternatives, not synchronized copies. Do not write a `connectorData.label` mirror or combine old `text` /
  `documentData` fields with `content`. Use Facade label methods instead of editing saved snapshots directly.
- `autoSize`: do not set width or height. The renderer measures content without automatic wrapping; explicit
  newlines still create lines. Prefer this for cardinalities, short roles, and concise relation names.
- `fixedWidth`: provide a positive finite `width`, omit height. Content wraps and the renderer derives height.
  Use it when a long annotation needs a deliberate width budget.
- `fixedSize`: provide positive finite `width` and `height`. Text wraps and clips; it does not shrink to fit.
  Use only when a bounded box is intentional, and review any hidden content before handoff.

Dimensions include padding and use Board units, not screenshot pixels. Do not combine `layout` constraints with
legacy top-level label dimensions, or write estimated/measured dimensions back into AutoSize. Query the installed
patch contract before resetting: in the declarative contract, `updateConnectorLabel(id, labelId, { layout: null })`
restores AutoSize without resetting placement; `placement: null` resets position independently.

Read back with `getConnectorLabels()`. Updating/removing one label must preserve sibling IDs, order, content, and
placement. `setConnectorLabels(id, [])` intentionally removes every label; it is not an update to the primary text.

## Position, wrapping, and line gaps are independent

`anchor` locates the label along the route. `side` chooses left / onPath / right relative to start-to-end travel,
not page direction or RTL locale. Paragraph alignment controls text inside the box; it does not move the box to
the other side of the connector. For the edge-spacing contract, `distance` is the perpendicular path-to-box-edge
gap, and endpoint `alongOffset` is an inset after marker clearance. Do not add half the estimated text width again.

For an explicit position use `placement: { anchor: "path", pathRatio: 0.75 }`, with a finite ratio from 0 to 1.
Do not add a top-level `pathRatio`, even with `undefined`: the canonical write API rejects it. Snapshot loading can
convert historical ratios, but that does not make them valid insertion or update parameters. Specify `center` when
the intended position is the whole-path midpoint; do not assume that omitting placement has the same behavior in
every installed version, especially for orthogonal routes.

If `api.Enum.BoardConnectorLabelAnchor.Auto` is available, the current contract makes omitted placement equivalent
to Center. Explicit Auto prefers the longest orthogonal segment and uses the whole-path midpoint on other routes;
recognized historical labels retain that automatic position during import. Choose Auto for that placement intent,
not as a general collision-avoidance algorithm. It does not guarantee a clear label corridor. Anchor Auto controls
position; Orientation Auto below controls readable rotation. Neither changes paragraph alignment or sizing.

Query `api.Enum.BoardConnectorLabelOrientation` before selecting an orientation. `Horizontal` keeps text horizontal;
`FollowPath` follows the directed tangent exactly, so text may be upside down on reversed edges; `Auto` follows the
line while keeping text upright. Prefer Horizontal for ordinary UML/ER annotations, or Auto when following the route
improves readability. Orientation changes neither the directed side nor paragraph alignment.

For a deliberate free adjustment, query `IBoardConnectorLabelPlacement`, `IBoardConnectorLabelOffset`, and
`IBoardFacadeConnectorLabelPatch`, then probe `api.Enum.BoardConnectorLabelOffsetSpace`. When this contract is
available, offsets live in `placement.offset`, not at label top level:

- `{ space: "path", along: 12, normal: 6 }` follows the directed route tangent; positive normal points left.
  Prefer semantic anchors and spacing first; this vector is for intentional fine adjustments, not guessed text sizes.
- `{ space: "canvas", x: 12, y: -6 }` stays in Board axes. Imported old offsets use this form to preserve position;
  it does not rotate with the route. Do not combine the two coordinate frames.

An explicit anchor or path-ratio patch clears free displacement unless the same patch supplies an offset.
`placement: { offset: null }` clears only displacement. Offset objects replace the complete vector; content/style
edits preserve it. In the menu, choosing an anchor clears free displacement but retains side spacing; choose
OnPath or reset placement as well if the label should sit on the line. Dragging/resizing writes path-relative
displacement, and width resizing preserves the opposite handle rather than snapping the label back to the route.
Verify both edges, repeated drag previews, and Undo/Redo when label UI interaction is explicitly in scope.

The new contract uses `style.interruptLine`; older SDKs may expose `style.lineBreak` instead. Query
`IBoardConnectorLabelStyle` and use only the installed field, never both. Legacy snapshot conversion is not
permission to send legacy fields through a new write API. This switch interrupts the route, not text wrapping. With interruption
enabled, the gap follows the final label box plus `lineGap`, wherever that box intersects the route—not only at the
center anchor. A short string in a wide FixedWidth box can therefore make a wide gap. Choose AutoSize for that
string instead of guessing a smaller character-based mask. Empty content should not cut the route.

## Verification and repair

Headless Facade success proves accepted data, not exact font metrics or visual clearance. After fonts and render
resources settle, inspect the full screenshot and rendered layout diagnostics. Treat label-layout-unresolved as
unfinished evidence, not a clean pass. Review `connector-label-overflow`, `connector-label-collision`, and
`connector-label-endpoint-constrained` when the installed renderer reports them; identify the affected stable
`labelIds`, not merely the connector ID. Same-connector collision checks do not prove that labels avoid every
other connector or shape.

Repair the affected label or nearby spacing: shorten wording without losing meaning, select a suitable sizing
mode, move an endpoint annotation, or give the terminal more room. Routing normalization does not fix wrapping,
font readiness, or a label box that is too large. Never silently reduce font size, drop multiplicities, replace
editable texts with an image, or move unrelated nodes just to obtain a clean diagnostic result. Recheck the final
readback and screenshot after repair. For a label-interaction test, also exercise a middle-label edit/delete and undo.
