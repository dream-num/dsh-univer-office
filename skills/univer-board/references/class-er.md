# UML classes and ER entities

Use native `insertTable()` presets (`BoardTableDiagramPreset.UMLClass` or the installed ERD preset) for editable
compartments. Preserve attributes, operations, field types, PK/FK information and constraints; do not replace
structured content with a text rectangle.

A table preset owns its initial dimensions and may override requested `rows`, `columns`, `width`, or `height`.
After insertion, call `getStructure()`, grow with `insertRows()` / `insertColumns()` if necessary, and size with
`resizeRows()` / `resizeColumns()` before `setValues()`. Read back both `getStructure()` and `getValues()`; a
successful insertion can still contain placeholder fields or too few rows. Style header and body text separately
when a preset's defaults are insufficient for the requested language or screenshot scale.
Also read the host element's transform; resource row/column sizes need not equal visible Board bounds.

## Relations and independent labels

Create tables first, then use `insertClassRelations()` or `insertEntityRelations()` with generated element IDs.
The helpers create regular editable connectors; they are not a parallel model.

- Class helpers cover association, directed association, aggregation, composition, generalization, realization,
  and dependency. Generalization/realization point from the specific class to its general type; composition and
  aggregation diamonds belong at the whole end. Check the installed helper's endpoint convention.
- ER helpers distinguish identifying/non-identifying lines and `one`, `zeroOrOne`, `oneOrMany`,
  `zeroOrMany` cardinalities independently at each end.
- Keep relation name, endpoint roles and multiplicities as independent semantic fields. Realize visible texts
  with stable label IDs using [connector-labels.md](connector-labels.md), not one space-padded string.
  ER helpers may supply only markers and a relation name; add requested endpoint/FK annotations with label APIs.
- Read back every field and label, and inspect terminal details in addition to an overview. Preserve meaning when
  resolving dense labels. Do not add multiplicities to inheritance just to exercise multi-label support.

Example relation between previously declared `order` and `line` nodes:

```json
{
  "id": "order-lines",
  "from": "order",
  "to": "line",
  "semantic": "composition",
  "label": "contains",
  "ends": {
    "from": { "role": "whole", "multiplicity": "1" },
    "to": { "role": "parts", "multiplicity": "0..*" }
  }
}
```

Node content can use `{ kind: "structured-table", sections: [{ label: "Attributes", items: ["id: UUID"] },
{ label: "Operations", items: ["submit(): void"] }] }`. These are semantic payloads, not table insertion parameters.
