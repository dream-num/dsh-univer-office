# Connector layout and repair

Read this for endpoint/layout decisions, rendered routing findings, or requested motion. Resolve exact method
signatures from the installed Facade; the following names are not permission to send unsupported fields.

## Bindings and routing

Create and arrange nodes before connecting them. For ordinary automatic relationships, omit `side`, `routing`
and `routingMode`: Facade planning selects facing sides and a straight unobstructed corridor or automatic
orthogonal routing. Use explicit ports, curves or manual waypoints when the intended topology requires them.

Independent fan-in/fan-out edges may need separate ports even if automatic routing succeeds. Order side
`position` values by the opposite nodes' geometry and use `setConnectorConnection()` to separate implicated
attachments. Shared terminal legs are appropriate for an intentional bus, not an accidental merge of relations.
Keep feedback paths clear of the main flow. Do not change unrelated nodes or existing manual topology.

For diamonds, ellipses and other non-rectangular shapes, start at side centers; add positioned attachments only
after checking the actual contour and marker clearance. Rectangle port assumptions need not fit other outlines.
Native interface stems have their own positioned-site considerations in [uml-structure.md](uml-structure.md).

Use bound endpoints, not guessed free points. A `connector-free-endpoint-near-element` finding calls for rebinding
the reported terminal through the shape-site/boundary contract. A `connector-free-endpoint-near-dashed-connector`
finding can identify a fake lifeline: use a native participant and lifeline/activation binding as described in
[sequence.md](sequence.md). Routing normalization does not repair endpoint meaning.

Marker types are a closed API union: query `BoardConnectorMarkerType` (for example `filledTriangle`,
`openArrow`, `filledDiamond`, `crowFoot`). No marker is `{ type: "none" }`, not `null`.
`style.dash` is a numeric pattern such as `[6, 4]`, or `[]` for solid—not a string or `strokeDash`.
Declare marker type/size/offset; let the renderer calculate paint bounds and terminal clearance.

## Rendered evidence

Run model analysis and a full `univer_screenshot`; inspect each returned image's `metadata.layoutAnalysis`. An automatic connector
without persisted route points can be unresolved in model analysis. Only final rendering establishes its route.

| Finding                                                                                            | Response                                                                                  |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `element-overlap`, `connector-through-element`, `connector-collinear-overlap`                      | Blocking unless the exact overlap is semantically intentional and visually verified       |
| `connector-terminal-direction-reversed`                                                            | Fix side/attachment or corridor; the terminal approaches against its outward normal       |
| `connector-marker-target-overlap`, `connector-marker-corner-overlap`, `connector-marker-collision` | Fix terminal space or marker size; do not accept hidden outlines/markers                  |
| `connector-crossing`, `connector-excessive-detour`                                                 | Review locally and improve unintended crossings or detours                                |
| `connector-terminal-stem-too-short`, `connector-terminal-dash-discontinuity`                       | Review spacing/style; do not fold a short direct corridor merely to obtain a stem         |
| Label layout findings                                                                              | Use [connector-labels.md](connector-labels.md); normalization cannot fix text constraints |

Inspect the named `connectorIds`, `elementIds`, `labelIds` when present and the issue's padded `focusBounds`.
Native map branches may intentionally share a trunk; sequence messages can cross intermediate lifelines or
fragment frames. Verify the exact objects and ownership before recording an exception. Text collisions, wrong
activation attachments and routes through unrelated nodes are not profile-wide exceptions. Preserve raw findings.

If an implicated ordinary connector's route state needs resetting, call
`board.normalizeConnectorRouting(["<connector-id>"])` once for that set, then recapture. It preserves endpoints,
labels, markers, style and ownership; automatic orthogonal routes may be a no-op. A non-null `affectedBounds`
covers changed geometry and bound endpoint elements; a no-op returns `null`.
Do not normalize native map-owned branches or deliberately manual routes as a blanket repair. If the issue
remains, fix its cause (bindings, spacing, labels or routing intent) rather than repeat normalization.

Use focused readable evidence and finish with an overview:

Call `univer_screenshot` for the selected `unitId` and `worktreeId`, with an authorized `output` directory.
For detail, pass the issue's `focusBounds` as `region`, or related `elementIds` with useful `padding` and `scale`.
Keep the full overview alongside those focused images.

## Optional motion

Animation is off by default. Enable it only when requested or when motion explains meaningful flow; structural
UML/ER relationships do not imply execution. There is no mandatory animation count or universal mode.
The installed `style.animation` contract may offer `dash`, `particle`, `pulse`, `gradient`, `particles`,
and `arrows`. Direction (`forward` / `reverse`) is independent of markers; pulse has no travel direction.
Omitting animation preserves it on update; `animation: null` disables it.

Screenshots freeze animation in a detached in-memory copy, without changing saved content. Use an actual viewer
cycle to verify requested motion; a still image only proves static appearance.
