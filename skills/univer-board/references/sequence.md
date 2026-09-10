# UML sequence diagrams

For UML sequence diagrams, realize participants first. Query `IBoardFacadeInsertSequenceMessagesOptions`: when
`timeOriginY` is supported, choose one Board-world origin and reuse it across batches, including single-message
calls. Message time is `timeOriginY + firstOffsetY + (order - 1) * step`, not an independent offset from each header.
Without that option, align existing participants' header bottoms or derive each endpoint's lifeline offset from
the same world time with the installed lower-level connector API. Do not align a late-created participant with
participants that already exist at the beginning.

Create activation bars with `BoardSequenceShapeType.ActivationBar` and bind their sequence
activation data to a lifeline, then create the ordered messages. An endpoint within an execution span must bind to
the activation bar's facing edge, not the lifeline center. Query the installed `insertSequenceMessages()` contract:
versions supporting activation selection use the unique covering bar; overlapping executions require explicit
`fromActivationId` / `toActivationId`. Earlier versions need `insertConnector()` or `setConnectorConnection()` with
`{ elementId: activationId, side: "left" | "right", position }`. Compute `position` from message world Y and the
activation's world bounds; it runs top-to-bottom on either vertical side. Outside execution spans use
`{ kind: "lifeline", shapeId: participantId, offsetY }`. Never replace this binding with a free point or pixel offset.
The generated binding is fixed: later adding/removing an execution or changing its semantic span requires reviewing
affected messages; resizing a bar preserves normalized attachment positions, not absolute message times.
Use native sequence-fragment Board tables, with guard/operand rows as structured content rather than connector
labels. Query `BoardTableDiagramPreset`: prefer `UMLSequenceAlternativeFragment` for multi-operand `alt`/`par` and
`UMLSequenceFragment` for single-operand `opt`, `loop`, `break`, `critical`, and `ref`. Set the operator cell explicitly;
a preset's placeholder title is not the requested operator. Never simulate lifelines with generic dashed
connectors—the semantic helper intentionally rejects them.

For self calls, send and receive times must differ: inspect `selfMessageHeight` and `selfMessageWidth` support before
using the helper. A same-participant synchronous call also needs a return leg; a zero-length line is not a self call.
Keep the receive time inside its intended activation/lifetime and leave room before the next message. For `create`,
position the new participant header at the receive time and bind to its facing header edge; do not bind to a
lifeline below the header. For `destroy`, end the receiving lifeline at the receive time and verify the cross there.
The insertion helper does not reposition participants or truncate their lifelines. Prepare those native elements
first, inspect the installed lifecycle validation, and verify endpoint readback and export rather than assuming
that a supported message-type string implements all of its semantics.

When fragments or activations matter, include their semantic scope in the spec rather than guessing it during
layout. An optional `fragments` list can contain `{ id, operator, operands: [{ guard, messageIds }] }`; use stable
relation IDs and explicit nested fragment IDs if nesting is needed. An optional `activations` list can contain
`{ participantId, startsAtMessageId, endsAtMessageId }`. Validate those references and message ordering. These
authoring fields express control flow and duration without storing frame bounds or activation geometry.
When executions overlap, give each activation a semantic `id` and reference it with `ends.from.activationId` or
`ends.to.activationId` on the message. Translate those semantic IDs to generated bar IDs during realization.

For `par`, preserve message order within each operand, not a strict order across operands. The horizontal dashed
divider separates parallel operands; their vertical stacking does not mean one finishes before the other starts.
Do not add an `else` guard to mean a second parallel branch. These are
[UML parallel-fragment semantics](https://www.omg.org/spec/UML/ISO/19505-2/PDF), not an execution scheduler.
Realization may use separate message batches with operand-local `order` and explicit offsets while retaining one
Board-world origin. Those offsets position the drawing; they do not create cross-operand precedence in BoardSpec.
Keep aggregation after the fragment when it requires both results. A native fragment table is a visual scope,
not a container that owns its messages: moving/resizing it does not reschedule messages or their activation spans.
Review operand boundaries and label clearance after frame edits, and preserve all unrelated bindings and content.

For sequence participants, keep the shape transform at the participant's native/default height.
The dashed lifeline is an extension below that participant; stretching the shape height stretches
the actor/control/entity symbol itself and pushes `{ kind: "lifeline", shapeId, offsetY }` messages
down by the same amount. Keep message offsets within the configured lifeline height and order them
by time.

## Frame content and bounds

A sequence-fragment table preset owns its initial dimensions and may override requested `rows`, `columns`, `width`, or `height`.
After insertion, call `getStructure()`, grow with `insertRows()` / `insertColumns()` if necessary, and size with
`resizeRows()` / `resizeColumns()` before `setValues()`. Read back both `getStructure()` and `getValues()`; a
successful insertion can still contain placeholder fields or too few rows. Style header and body text separately
when a preset's defaults are insufficient for the requested language or screenshot scale.
Also read the Board element's transform: table-resource row/column sizes and the host's visible bounds can differ.
For a sequence frame, verify its actual bounds enclose every operand's messages and all participating lifelines;
adjust the host with `setElementTransform()` when necessary, then recapture instead of assuming table resize did it.
Leave a left gutter for the frame's title notch and top-aligned operand guards, clear of lifelines and activation
bars. Place operand dividers and the bottom border between rendered message label bounds, not merely between
connector Y positions; a following message's label can extend upward into the frame. If a guard needs a shorter
visible form, preserve its full condition in the spec and keep the abbreviation unambiguous.

Message `messageType` values are `synchronous`, `asynchronous`, `reply`, `create`, `destroy`, or `self`.
Keep semantic IDs for messages referenced by activations/fragments; generated connector IDs are separate.
For independent endpoint annotations, read [connector-labels.md](connector-labels.md).
