# Flowcharts, activities and states

Use native `ShapeTypeEnum.Flowchart*` shapes for flowcharts, `createSwimlane()` for responsibilities, and
containers for composite states. Match control-flow meaning before choosing a visual layout.

For activity control flow, distinguish `fork` / `join` from `decision` / `merge` in `semanticRole`.
A fork starts concurrent branches; the ordinary join waits for all incoming branches. A merge accepts alternative
paths without synchronization. Use a merge for initial entry plus a retry path, not a join that waits for both.
Keep decision conditions on outgoing relations as semantic `condition` text and render them as `[guard]` labels.
These distinctions follow [OMG UML activity control nodes](https://www.omg.org/spec/UML/ISO/19505-2/PDF).

Realize fork/join with native `BoardCustomShapeType.StateBar`, not sequence activation bars or a free thick line.
Use the native initial/final symbols, diamonds for decision/merge, and action shapes for work. An unlabeled merge
diamond is intentional. Bind each control-flow endpoint to its node; distribute independent branch ports along
the bar and verify both incoming and outgoing arrows visually. A cross-lane bar can belong to the swimlane pool's
`contains` without belonging to any individual lane; actions belong in the responsible lane's `contains` instead.
Read back `parentId` and `laneId`: visual enclosure does not establish ownership. Route retries around the main
flow and read back the affected bindings.
This is diagram authoring, not an execution engine or proof of deadlock freedom.

For composite state diagrams, represent the enclosing state as a group with `semanticRole: "composite-state"`.
Use `semanticRole: "orthogonal-state"` when its child regions execute concurrently, and `state-region` groups for
those regions. Keep real nesting in `contains`; regions are not responsibility swimlanes. On states, optional
`entry`, `do`, and `exit` describe behavior. On transitions, keep `trigger`, `condition`, and `effect` separate;
realize them as `trigger [guard] / effect`. Short event names should not be split by an arbitrary fixed width.
For a long annotation, place explicit line breaks between semantic parts or choose a tested wrapping width.

Entering an orthogonal state enters all its regions. A region's final state completes that region, not the whole
machine. Mark an untriggered outgoing completion transition with `completion: true`; it becomes eligible only
after the enclosing state's completion requirements, including all regions, are satisfied. Do not invent an event
for that transition. Keep bounded retries inside their region when other regions should remain active; a transition
that exits and re-enters the enclosing state also exits and re-enters its regions. These are
[OMG UML state-machine semantics](https://www.omg.org/spec/UML/ISO/19505-2/PDF), not executable Board behavior.

Realize the enclosing state and its regions as native nested containers, using a dashed separator for orthogonal
regions and native initial/final symbols. When ownership is already known, inspect `createContainer()` and pass
`parentId` with parent-local coordinates at creation. Creating overlapping containers at the root and reparenting
later can let automatic capture reverse the intended hierarchy. Read back ownership before inserting transitions.
Bind completion/error transitions to the enclosing state when that is their semantic source, and local transitions
to the actual substates. Check actual descendants and bindings; movement/Undo testing belongs to an explicit interaction review.
