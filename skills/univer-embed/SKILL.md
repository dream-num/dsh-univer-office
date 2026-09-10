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

When a Chart on a Slide, Doc, or Board should reflect a range in another Unit, bind a ResourceRef instead
of copying values. Copied values are a snapshot. Use `univer_api` to show `IResourceRefChartDataSourceInput`
before constructing the exact reference. Pass its contents (`{ file?, unit, part }`) directly to
`newChart(...).setSource(ref)`; for an existing live Chart use `await chart.setDataSource(ref)`.
Wrapping the ref as `{ source: { kind, ref } }` fails normalization with `RESOURCE_REF_INVALID_UNIT`.

Verify that the stored `dataSource.source.kind` is `resource-ref`, then read back the exact source Unit,
selector, range, and resolved Chart data in a fresh `univer_execute`. A stored reference alone does not
prove that the source loads or that the Chart refreshes.

Keep source and host in the same `.univer` file and selected worktree scope. Referenced Units can load
on demand in the content runtime; do not assume a Chart-only source is preloaded by `univer_screenshot`.
If it shows a placeholder, verify the reference and review the Chart in the live Viewer. The Viewer
watches referenced Sheet ranges; verify a requested source edit refreshes the Chart there. A still
screenshot or headless read does not prove live refresh, which requires the runtime's `watchData` provider.
