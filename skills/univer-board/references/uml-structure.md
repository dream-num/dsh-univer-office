# Structural UML and scope diagrams

Read the section matching the requested notation; these profiles do not imply runtime execution.

## Deployment and packages

For nested deployment views, distinguish `trust-boundary`, `deployment-node`, and `execution-environment` with
`semanticRole` on groups; place services and stores in their actual group's `contains`. Code packages describe
namespaces instead, using `groupType: "uml-package"`; do not infer deployment hosts from package nesting.
Create known container parents before their children, with the installed parent-local insertion contract, and
read back every membership. For shapes whose insertion contract lacks `parentId`, insert at world coordinates,
then use `moveElementsToContainer()` and verify the resulting world bounds. Do not invent unsupported fields.

Choose relationship endpoints by meaning: a service request binds the service, while a host communication path
binds the host. Package import/access relations point from the importing/accessing package to the referenced
package; realize them as dashed dependencies with separate `«import»` / `«access»` labels, not inheritance.
A stored container kind does not guarantee a folder-tab or three-dimensional device glyph. Inspect the installed
rendering and disclose simplified scope boxes when strict UML notation is unavailable. Keep native bindings on
storage/component outlines; a reversed terminal is a geometry defect, not a reason to substitute a free endpoint.

## Use cases

For use-case diagrams, distinguish behavioral reuse from temporal flow. `include` points from the including use
case to the included use case; `extend` points from the extending use case to the base use case. Both realize as
dashed connectors with an `openArrow` at the target and a separate `«include»` or `«extend»` label. Generalization
points from the specialized actor/use case to the general one, using a solid line and target `openTriangle`.
Actor associations normally have neither arrowhead nor stereotype. Do not use flow arrows or animation to imply
execution order. These meanings follow [OMG UML use-case semantics](https://www.omg.org/spec/UML/2.5.1).

Validate `include`/`extend` endpoints as use cases. Generalization connects like kinds (actor to actor or use case
to use case), with no inheritance cycle.

When extension locations matter, declare `extensionPoints` on the base use-case node and reference those names in
the extending relation's `extensionPoints` list. Keep its optional `condition` as semantic text. Every referenced
point must belong to the relation's `to` node, not its `from` node. Preserve the condition and locations in readable
annotation content; for strict UML notation, use a note attached to the extend relationship. If that attachment is
unavailable, report the notation limitation instead of silently discarding the condition. Keep actors outside the
system container and read back real membership for the enclosed use cases. Check non-central ellipse attachments
visually; a rectangle's normalized port placement can intersect an ellipse's outline.

Use-case reuse and conditional extension remain semantic, without coordinates or marker configuration:

```json
{
  "schemaVersion": 1,
  "diagramType": "uml-use-case",
  "nodes": [
    {
      "id": "run",
      "label": "Execute task",
      "semanticRole": "use-case",
      "extensionPoints": ["high-risk-call"]
    },
    { "id": "validate", "label": "Validate constraints", "semanticRole": "use-case" },
    { "id": "approve", "label": "Human approval", "semanticRole": "use-case" }
  ],
  "relations": [
    { "from": "run", "to": "validate", "semantic": "include" },
    {
      "from": "approve",
      "to": "run",
      "semantic": "extend",
      "condition": "Tool call is high risk",
      "extensionPoints": ["high-risk-call"]
    }
  ]
}
```

## Components and interfaces

For component diagrams, a component may declare `provides` and `requires` as lists of named interface contracts.
An `assembly` relation identifies its `contract`, with `from` as the provider and `to` as the consumer; this
orientation records ownership, not a call arrow. For example:

```json
{
  "schemaVersion": 1,
  "diagramType": "uml-component",
  "nodes": [
    {
      "id": "model",
      "label": "Model Gateway",
      "semanticRole": "component",
      "provides": ["IInference", "IHealth"]
    },
    {
      "id": "planner",
      "label": "Planner",
      "semanticRole": "component",
      "requires": ["IInference", "ICredentials"]
    }
  ],
  "relations": [
    {
      "id": "inference",
      "from": "model",
      "to": "planner",
      "semantic": "assembly",
      "contract": "IInference"
    }
  ]
}
```

The contract must appear in the provider's `provides` and consumer's `requires`. Unassembled declarations are
meaningful: keep the unconsumed provided interface and the unbound required interface visible when relevant; do not
invent a consumer/provider. Use stable contract identifiers when display names alone cannot distinguish contracts.
Names identify the intended match, not proof of signature or protocol compatibility.

Query `BoardCustomShapeType.ComponentBox`, `ProvidedInterface`, `RequiredInterface`, and `AssemblyConnector`.
Use the native ball for a provided interface, socket for a required interface, and ball-and-socket for assembly.
Connect an assembly symbol to its provider and consumer with two ordinary bound connectors, without arrowheads;
keep a separate dashed `«use»` dependency when needed. The symbol and both connectors remain independent editable
Board objects, not a compiler-managed composite. Ports and delegation are separate UML concepts: do not claim their
coverage from an assembly symbol. These distinctions follow [OMG UML component notation](https://www.omg.org/spec/UML/ISO/19505-2/PDF).

Inspect the installed positioned-endpoint contract before connecting native interface stems. When supported, an
explicit side-center `position: 0.5` projects to the native outline; the plain frame-side anchor may leave a gap
because the glyph has internal padding. Check both stems at readable scale. A reversed-terminal diagnostic on an open stem is not an acceptable UML exception; report a runtime
limitation if the installed version cannot bind it correctly, rather than replacing the binding with a free point.
