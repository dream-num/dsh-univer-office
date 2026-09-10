# Semantic BoardSpec

Use a compact JSON object to preserve relationship-heavy intent before realization. This is an agent planning
artifact, not an SDK parameter, a compiler contract, or a replacement for the Board model. Simple edits and
standalone content do not require it.

## Core shape

```json
{
  "schemaVersion": 1,
  "diagramType": "dataflow",
  "title": "Order event topology",
  "nodes": [
    { "id": "checkout", "label": "Checkout API", "semanticRole": "service" },
    {
      "id": "orders",
      "label": "orders.v1",
      "semanticRole": "message-bus",
      "description": "Order events, partitioned by order_id"
    }
  ],
  "relations": [
    {
      "id": "publish-orders",
      "from": "checkout",
      "to": "orders",
      "semantic": "publish-event",
      "label": "OrderPlaced",
      "importance": "primary"
    }
  ],
  "groups": [
    {
      "id": "order-system",
      "label": "Order system",
      "groupType": "system-boundary",
      "contains": ["orders"]
    }
  ]
}
```

Required fields: `schemaVersion: 1`, `diagramType`, `nodes`, `relations`. Nodes have stable semantic `id`,
`label` and `semanticRole`. Roles are descriptive domain vocabulary, not a closed enum or a mandated visual style.
Use `semanticRole` rather than node `role`, which Board elements reserve for runtime-owned behavior. Add
`description` when role and label do not convey enough intent, and `content` for meaningful structured payloads.

Relations have `from`, `to`, and `semantic`; optional `label` is visible wording. Give referenced relations stable
`id` values (for example, messages defining an activation span). `ends.from` / `ends.to` hold endpoint semantics
such as role, multiplicity, cardinality or activation identity—not node roles. Add positive `order` only where
ordering matters; scope it to sequential messages, a parallel operand, or siblings under one tree parent.
Optional `activity` and `importance` describe meaning, not animation settings.

Groups use `id`, `label`, `groupType` and `contains`; groups may contain groups. Common kinds are `container`,
`system-boundary`, `uml-package`, and `swimlane`. A swimlane can declare
`lanes: [{ id, label, contains: [...] }]`. Each member has at most one direct group/lane owner; a pool-wide
control node can belong to the pool rather than a lane. Mind-map `contains` relations mean topic hierarchy,
not Board container ownership.

Keep all coordinates, dimensions, concrete shape types, style, ports, routes, markers and animation settings out
of the spec. The agent chooses those after reading the installed API and current Board. Not every relation
requires a line: `annotates` can become an Ink underline or a nearby note.

## Select only the relevant grammar

| Intent / `diagramType`                                       | Native candidates and focused reference                                                   |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `flowchart`, `uml-activity`, `uml-state`                     | Flowchart shapes, StateBar, lanes/containers: [flow-state.md](flow-state.md)              |
| `uml-sequence`                                               | Native participants/activations and ordered messages: [sequence.md](sequence.md)          |
| `uml-class`, `erd`                                           | Table compartments and semantic relation helpers: [class-er.md](class-er.md)              |
| `uml-use-case`, `uml-component`, `uml-package`, `deployment` | Actors, interfaces and real scopes: [uml-structure.md](uml-structure.md)                  |
| `mindmap`, `tree`, `timeline`                                | Native structured layout: [mind-map.md](mind-map.md)                                      |
| `architecture`, `dataflow`                                   | Responsibilities, payload direction, storage and actual scope membership                  |
| Any profile with mixed content                               | Dedicated native APIs and semantic payloads: [content-selection.md](content-selection.md) |

A profile guides selection, not an all-elements template. Instance-specific meaning belongs here; reusable selection
rules stay in references. Read a second reference only if that capability participates in the requested result.

## Check before realization

Check in memory or with a short script; no general parser/compiler is needed:

- Node/group IDs are non-empty and unique; relation IDs are unique when supplied. Endpoints and membership
  references exist. Groups are acyclic; lane IDs are unique within their pool; direct ownership is unambiguous.
- Required data/compartments and any referenced message, activation, extension point or interface contract exist.
- Ordered relations have positive, scope-unique orders. Each native map is connected and acyclic with one parent
  per non-root. Parallel operands must not acquire unintended precedence.
- Relation direction, cardinalities, guards and lifecycle semantics match the selected grammar. Fix ambiguities
  that change meaning before creating elements.

Repair structural failures before mutation. Geometry is checked after realization, using model readback and
rendered diagnostics. Preserve a semantic-to-generated ID mapping rather than sending this object to the SDK.

JSON is the exchange form; accept user YAML or fenced Markdown by normalizing to the same object, not by
maintaining three schemas. Compact notation is fine. Do not duplicate an existing valid spec just to reformat it.
