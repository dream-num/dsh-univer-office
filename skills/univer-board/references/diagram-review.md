# Diagram generation review

Use this reference when testing several Board profiles or assessing skill coverage. Test the installed SDK, not
only the APIs described by an unreleased change. Keep semantic specs, realization scripts, persisted readbacks,
full screenshots, and raw layout diagnostics together in a local output directory. Do not add generated user
artifacts to repository history unless requested.

## Evidence by profile

One moderately complex example exercises a profile; it does not cover every UML grammar feature or every UI action.
Select cases based on the request and explicitly list omissions instead of claiming exhaustive coverage.

| Profile       | Evidence beyond a successful insert                                                                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flowchart     | Decision labels, distinct branch ports, merge, and a feedback path outside the main flow.                                                                                                                 |
| UML activity  | Responsibility lanes with actual `parentId`/`laneId`; guards and correct fork/join semantics when requested. A single-decision example is not a fork/join test.                                           |
| Dataflow      | Producer/consumer direction, named payloads, storage, fan-in and fan-out without accidental shared terminal legs.                                                                                         |
| Architecture  | Runtime responsibilities, external dependencies, scope membership, and readable primary versus secondary relationships.                                                                                   |
| Deployment    | Host/runtime nesting and trust boundaries, with connectors bound to the intended service rather than its enclosing container.                                                                             |
| UML sequence  | Native lifelines; ordered messages; bound activations; fragment operator and operand guards. Check synchronous/asynchronous/reply separately from create/destroy/self, and report untested message types. |
| UML class     | Editable attribute/operation compartments; inheritance direction; whole-side composition/aggregation diamonds; dependency/realization dashes; independently readable endpoint roles and multiplicities.   |
| ERD           | All fields and PK/FK information preserved; identifying versus non-identifying edges; exact optional/mandatory and one/many cardinalities at both ends.                                                   |
| UML use case  | Actors outside a real system boundary, separate associations, and correctly directed `include`/`extend` when present. Prefer direct association lines when orthogonal fan-out would look like a bus.      |
| UML state     | Initial/final symbols, transition guards/events, recovery path, and composite/concurrent state semantics if requested.                                                                                    |
| UML component | Components plus the provided/required interface relationship when the user needs it; dependency-only examples do not exercise assembly connectors.                                                        |
| UML package   | Actual group membership and nested packages when requested; package dependency is not class inheritance.                                                                                                  |
| Mindmap       | One semantic root, acyclic parent/child tree, sibling order, branch-side choice, and no truncated labels.                                                                                                 |
| Tree          | Correct structured layout and hierarchy readback; do not replace native tree branches with ordinary connectors.                                                                                           |
| Timeline      | Explicit stage order and event children. State whether positions mean chronological time or conceptual progression; do not invent historical dates.                                                       |

For structured-table, chart, image, sticky, external-resource, embed, and ink payloads, add a separate mixed-content
case when those capabilities are in scope. An unavailable sticky/embed API is a capability limitation, not permission
to silently substitute a generic shape and call it a native test. An embed descriptor alone does not prove the
child resource loaded, rendered, or is interactive.

For component assembly, include a matched provided/required pair plus an unconsumed provided interface and an
unbound required interface. Distinguish their native symbols from dashed dependencies. Move an assembly symbol,
verify both connectors follow without rebinding, and check one-step Undo/Redo restores complete snapshots while
unrelated components and wires stay unchanged. This does not prove typed-port or delegation support.

For composite/concurrent states, include two real child regions, region-local initial/final symbols, a bounded
retry, an outer completion transition, and an external recovery path. Verify each region's ownership, that local
retry does not imply re-entry of the other region, and that completing one region is not presented as completing
the enclosing state. Move the outer container through the UI and a region through its installed API; check world
bounds, bindings, labels, unrelated objects, and complete one-step Undo/Redo snapshots. A static region separator
does not prove native nesting, and a correct drawing does not prove an executable state machine.

For nested deployment/package cases, exercise a parent with multiple descendants and at least one relationship
crossing its boundary. Drag the parent through the UI; verify child-local coordinates and ownership stay intact,
world bounds follow the parent, external endpoints remain bound, and unrelated objects stay unchanged. Check
complete snapshots after one Undo and one Redo. Preserve deliberately manual dependency guides when their owner
did not move, and inspect the resulting bends rather than claiming that unchanged waypoints guarantee good layout.
Distinguish actual package/container ownership from a decorative enclosing rectangle and report simplified notation.

## Multi-label class and ER relationship cases

A multi-label coverage claim needs more than several single-label connectors. Include a class association or
composition with five independent labels: relation name, two endpoint roles, and two multiplicities. Include
horizontal, vertical, and reversed-direction relationships, and a full overview plus a readable terminal detail.
Do not add roles or multiplicities to inheritance/dependency merely to increase the label count.

For ERD, cover the four cardinalities and identifying/non-identifying lines. Endpoint roles, textual cardinalities,
and an FK/constraint annotation can exercise multiple independent labels alongside the native cardinality markers.
`insertEntityRelations()` supplies markers and a relation label; add the other texts with the installed multi-label
API, not separate text shapes or one space-padded string. Read back label IDs and count, edit one label, and verify
siblings are unchanged through undo/redo. Report API-command checks separately from actual mouse/menu interactions.

Check readable text even when rendered layout analysis is clean: a long role or FK annotation can wrap or split a
word inside its label box without a route diagnostic. Widen the affected label and review its clearance from the
path and neighboring labels; vertical labels need more lateral clearance than horizontal endpoint labels.

## Review diagnostics in semantic context

Retain the raw diagnostics even when visual review shows a likely false positive. Native mind-map/tree branches can
share a trunk intentionally. A sequence message may cross an intermediate lifeline or a fragment frame without
being incorrectly routed. Verify native ownership and exact implicated elements before recording such an exception;
never suppress all overlaps for a profile. Crossing text, an unrelated node, or a wrong activation is still a defect.

For each sequence message, inspect both terminals at readable scale: incoming arrows stop on the facing activation
edge and outgoing lines start there, including replies traveling right-to-left. A terminal reaching the center of
its own activation is a defect, not an intermediate-lifeline exception. Read back the bound activation ID and side;
test an inactive interval separately. For nested executions, preserve explicit execution identity instead of
choosing the topmost bar by appearance. Verify bar movement/resizing keeps attachments; do not claim this from a
static screenshot alone.

Include unequal participant header heights and a late-created participant in the sequence review. Ordinary
send/receive endpoints must share a world Y; self calls need distinct send/receive Y values and a readable editable
loop. Check creation at the new header edge and destruction at the actual lifeline end. Test these separately from
marker style, and verify export as well as insertion: a header-bound connector exercises the common Shape adapter.

Do not normalize layout-owned native branches to make a generic connector report green. Use the owning structured
layout API if adjustment is needed. Apply routing normalization only to ordinary implicated connectors, once, as
described in [connector-routing.md](connector-routing.md). Report `clean`, `visually reviewed with diagnostic exceptions`, or `blocked` separately;
a reviewed exception is not a zero-error lint result.

Check long labels, multilingual text, compartment sizing, and frame guards at readable scale. Draw sequence frames
behind participants/messages and keep message labels clear of intermediate activation bars. Use inset endpoint text
for UML roles/multiplicities; do not concatenate several values into one space-padded label as a substitute for the
multi-label API. If unavailable, retain the semantics in the spec and report the missing visible annotation.

Full screenshots must include lifeline extensions and the last message, not just participant shape bounds. If a
region capture is unsupported or fails, report it and keep a full screenshot; do not present a cropped overview as
proof of readable endpoint labels. A screenshot confirms static rendering, not drag/edit/menu/undo behavior. Claim
UI-interaction coverage only after actual interactions and persisted-state assertions have been exercised.
