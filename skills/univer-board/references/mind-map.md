# Mind maps, trees and timelines

Choose the semantic family before the concrete `structureKind`. Inspect the installed `FBoard.insertMindMap`
contract; the native structure vocabulary below belongs in realization, not BoardSpec.

| User intent and relationship meaning                                        | BoardSpec profile | Native realization candidates               |
| --------------------------------------------------------------------------- | ----------------- | ------------------------------------------- |
| Explore one topic through peer categories and subtopics                     | `mindmap`         | `mindmap-horizontal`, `mindmap-vertical`    |
| Explain ownership, decomposition, or a reporting hierarchy                  | `tree`            | `tree-right`, `tree-left`, `tree-alternate` |
| Explain ordered stages, milestones, or dated events with supporting details | `timeline`        | `timeline-horizontal`, `timeline-vertical`  |

For example, "map Agent capabilities" favors a mind map; "break down the Agent implementation work" favors a tree;
"show Agent capability evolution" favors a timeline. "Show calls between Agent modules" instead favors architecture
or dataflow, even if the modules also have an ownership hierarchy. A chain of calls is not automatically a timeline.

Topology only establishes whether a tree is possible. Use labels, relation `semantic`, `description`, and the user's
purpose to choose the family. If either mind map or tree would work, choose one and briefly explain the choice;
ask only when the ambiguity changes the meaning. Do not add a required layout-preference field to BoardSpec.

Choose horizontal/vertical orientation and branch sides from available Board space, readable label lengths, and
the surrounding content. A wide region can suit a horizontal timeline; a narrow, tall region can suit a vertical
one. Left/right/alternate tree structures are presentation choices, not different ownership semantics. Preserve
existing layout and manually chosen branch sides when editing unless the requested change requires rearrangement.

Represent hierarchical edges with `semantic: "contains"`, from parent to child. These describe topic membership,
not ordinary Board container ownership; do not create containers for every topic. Each native map has one root,
each non-root has one hierarchical parent, and the hierarchy must be connected and acyclic. Multiple parents,
cycles, and cross-links cannot become native tree branches: retain meaningful cross-links separately with supported
bound connectors, or choose a general graph. Do not duplicate an entity or remove a relation without explaining it.

When sibling order matters, use positive `order` values unique within that parent, not globally across the tree.
For timelines, the root's children are ordered stages; their children are stage details. Record whether the order
is conceptual progression or chronological in `description`. Keep supplied dates in content, never invent dates,
and do not imply that equal native timeline spacing measures equal elapsed time.

This conceptual progression has stage-local details; the shared order value `1` under different parents is valid:

```json
{
  "schemaVersion": 1,
  "diagramType": "timeline",
  "title": "Agent capability progression",
  "nodes": [
    {
      "id": "evolution",
      "label": "Agent evolution",
      "semanticRole": "topic",
      "description": "Conceptual progression, not dated history"
    },
    { "id": "tools", "label": "Tool use", "semanticRole": "stage" },
    { "id": "planning", "label": "Planning", "semanticRole": "stage" },
    { "id": "teams", "label": "Multi-agent collaboration", "semanticRole": "stage" },
    { "id": "validation", "label": "Validate tool results", "semanticRole": "capability" },
    { "id": "handoff", "label": "Explicit task handoffs", "semanticRole": "capability" }
  ],
  "relations": [
    { "id": "stage-tools", "from": "evolution", "to": "tools", "semantic": "contains", "order": 1 },
    {
      "id": "stage-planning",
      "from": "evolution",
      "to": "planning",
      "semantic": "contains",
      "order": 2
    },
    { "id": "stage-teams", "from": "evolution", "to": "teams", "semantic": "contains", "order": 3 },
    {
      "id": "tool-validation",
      "from": "tools",
      "to": "validation",
      "semantic": "contains",
      "order": 1
    },
    { "id": "team-handoff", "from": "teams", "to": "handoff", "semantic": "contains", "order": 1 }
  ]
}
```

Translate the hierarchy to the installed native blueprint rather than drawing ordinary rectangles and branches.
Retain semantic-to-generated ID mappings. Verify all nodes, parent/child ownership, sibling order, and full text
after insertion. For large maps, inspect a readable branch as well as the overview; do not hide truncation by
zooming out. When collapse/expand behavior is in scope, test it through the owning native API or UI and verify descendants.
Do not normalize native map branches as ordinary connectors; their layout owner controls them.
