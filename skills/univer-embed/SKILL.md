---
name: univer-embed
description: Embed one Univer Unit inside another through DSH tools and the Lite Interface. Use proactively when a Sheet, Doc, Slide, Base, Board, dashboard, report, presentation, database, or canvas should display or interact with content from another Unit in the same .univer file.
---

# Embed Units

Load `univer` plus the host and child Unit skills first. Keep both Units in the same `.univer` file and same draft worktree, and address each by exact `unitId`.

The Viewer supports one Embed level only. A host may contain multiple sibling Embeds, but do not embed a Unit that itself contains an Embed. Keep those Units as siblings or link them instead.

Use `univer_api` to show `FUniver.createEmbed`, `FEmbed`, `FEmbedHostSurface`, `ICreateEmbedParams`, and `IEmbedDescriptor` before authoring unfamiliar Embed code.

Create and verify the child Unit first. Use its exact `unitId` and actual Unit type in the ResourceRef. For a `SheetFloating` host, `context` requires explicit drawing placement. Absolute canvas bounds use `{ kind: univerAPI.Enum.SheetDrawingAnchorType.None, bounds: { left, top, width, height } }`.

Example: embed a Doc as a Sheet tab through `univer_execute` targeting the host Sheet Unit:

```js
const hostUnitId = "<host-unit-id>";
const childUnitId = "<child-unit-id>";
const sourceRef = "#unit=" + childUnitId + "&type=doc";
const embed = univerAPI.createEmbed({
  embedId: "<embed-id>",
  host: {
    unitId: hostUnitId,
    surface: univerAPI.Enum.FEmbedHostSurface.SheetTab,
  },
  content: {
    unitType: univerAPI.Enum.UniverInstanceType.UNIVER_DOC,
    ref: sourceRef,
  },
  interaction: "interactive",
});
const child = await embed.loadAsync();
if (!child || child.getId() !== childUnitId) {
  throw new Error("Embedded child mismatch");
}
const descriptor = embed.getDescriptor();
if (descriptor.source?.ref !== sourceRef) {
  throw new Error("Embedded ResourceRef mismatch");
}
return { childUnitId: child.getId(), descriptor };
```

For another child type, change both `unitType` and the ResourceRef `type` to the same actual type.

After mutation:

1. Re-read the returned child Facade and descriptor in a fresh `univer_execute`.
2. Verify the exact child Unit ID/type, ResourceRef, host surface, interaction mode, and host anchor/placement.
3. Inspect both host and child Units with `univer_inspect` where useful.
4. Follow the Host Unit Skill's `univer_screenshot` workflow and inspect the returned PNG to confirm the child renders inside its host. Structural ResourceRef readback remains required because a screenshot alone does not prove the child ID/type binding.
5. Follow the `univer` ready/status workflow.

## Referencing another Unit's data from a Chart

When a Chart on a Slide, Doc, or Board should reflect a range in a different Unit, bind it as a
ResourceRef instead of pasting the values. Values are a snapshot: a source edit will not change the
Chart. A ResourceRef keeps the Chart live.

The source and host Units live in the same `.univer` target; each is addressed by `unitId`. Resolve
the exact source object with `univer_api` (`action: "show"`, `queries: ["IResourceRefChartDataSourceInput"]`),
then pass it straight
to the host Chart's `setSource` — it accepts the ref contents (`{ file?, unit, part }`) directly.
Wrapping it as `{ source: { kind, ref } }` fails normalization with `RESOURCE_REF_INVALID_UNIT`.

Verify the stored source is a reference (its `dataSource.source.kind` is `resource-ref`), and confirm
the Chart reads the referenced range in a fresh read back. A cross-Unit reference resolves only when
the source Unit is loaded in the same runtime as the host — in the Viewer both are open together (for
example both embedded in a Board). If the source is not loaded, `univer_execute` or `univer_screenshot` can show a placeholder;
review the Chart in the Viewer.

Live refresh works when the runtime registers a referenced-source data provider (`watchData`) that
watches the source range. The plugin Viewer registers one for Sheet ranges; a runtime without it
never updates the Chart on a source edit, and headless `univer_execute`/`univer_screenshot` never drive this
refresh.
