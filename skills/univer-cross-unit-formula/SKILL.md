---
name: univer-cross-unit-formula
description: Author, calculate, update, inspect, and verify cross-Unit formulas through DSH tools and the Lite Interface. Use proactively when a Sheet cell or formula-driven Shape in a Sheet, Doc, Slide, or Board reads a Sheet range or Base table column from another Unit in the same .univer file.
---

# Cross-Unit formulas

Load `univer`, the Host Unit skill, and the Sheet or Base Source Unit skill first. This Skill owns the external Source binding, formula, calculation, and cross-Unit verification; the Host skill owns coordinates, content, and visual behavior.

Cross-Unit formulas support two consumers:

- a Sheet cell;
- a regular Shape in a Sheet, Doc, Slide, or Board whose displayed text comes from the formula result.

## Resolve the public API

Before authoring, call `univer_api` for `FRange.setFormula`, `FShape.setFormula`, `FShape.getFormulaResult`, `FShape.removeFormula`, `FFormula.buildReference`, `FFormula.upsertExternalReference`, and `FFormula.onCalculationResultApplied`.

Use explicit host and source handles. Do not select either Unit through `getActive*()`. Resolve by the Unit IDs chosen from `univer_status`, for example `univerAPI.getWorkbook(hostUnitId)`, `univerAPI.getWorkbook(sourceUnitId)`, or `univerAPI.getBase(sourceUnitId)`.

## Reference rules

- The caller supplies the source Unit. `buildReference()` serializes a reference; it does not discover Units.
- Use `sourceUnit.getName()` as `formulaQualifier`; formulas address Units by name while metadata preserves stable IDs.
- Use `SHEET_RANGE` for a Sheet range and `TABLE_COLUMN` for a Base table column.
- Let `buildReference()` quote and escape Unit, sheet, table, and column names.
- Sheet cells and formula-driven Shapes read the Host's external-reference metadata.
- A cell reads the persisted mapping directly. A Shape receives both formula and complete Source identities in `setFormula()`.
- Subscribe to calculation completion before `setFormula()` or before changing referenced data, then await it.

## Sheet Source binding

Resolve both Units and build the reference in one `univer_execute` call targeting the Host:

```js
const hostUnit = univerAPI.getWorkbook("<host-sheet-unit-id>");
if (!hostUnit) throw new Error("Host Sheet Unit was not found");
const hostSheet = hostUnit.getSheetByName("Dashboard");
if (!hostSheet) throw new Error("Host sheet Dashboard was not found");

const sourceUnit = univerAPI.getWorkbook("<source-sheet-unit-id>");
if (!sourceUnit) throw new Error("Source Sheet Unit was not found");
const sourceSheet = sourceUnit.getSheetByName("Orders");
if (!sourceSheet) throw new Error("Source sheet Orders was not found");

const formula = univerAPI.getFormula();
const reference = formula.buildReference({
  hostUnitId: hostUnit.getId(),
  unit: {
    unitId: sourceUnit.getId(),
    formulaQualifier: sourceUnit.getName(),
  },
  target: {
    kind: univerAPI.Enum.FormulaReferenceType.SHEET_RANGE,
    sheetName: sourceSheet.getSheetName(),
    range: { startRow: 1, endRow: 3, startColumn: 1, endColumn: 1 },
  },
});
```

## Sheet cell consumer

Continue in the same execution and subscribe before writing:

```js
const targetCell = hostSheet.getRange("C1");
const applied = formula.onCalculationResultApplied(30_000);
targetCell.setFormula(`=SUM(${reference})`);
await applied;
return { formula: targetCell.getFormula(), value: targetCell.getValue() };
```

## Formula-driven Shape consumer

Create a regular Shape through the Host Unit skill, then bind it to the same reference and Source identity:

```js
const shape = hostSheet.insertShape({
  shapeType: univerAPI.Enum.ShapeTypeEnum.Rect,
  transform: { left: 700, top: 240, width: 280, height: 72 },
});
if (!shape) throw new Error("Formula-driven Shape could not be inserted");

const applied = formula.onCalculationResultApplied(30_000);
shape.setFormula({
  formula: `=SUM(${reference})`,
  externalReferences: [
    {
      qualifier: sourceUnit.getName(),
      sourceUnitId: sourceUnit.getId(),
      sourceUnitType: univerAPI.Enum.UniverInstanceType.UNIVER_SHEET,
    },
  ],
});
await applied;

const result = shape.getFormulaResult();
if (result?.status !== univerAPI.Enum.FormulaShapeResultStatus.SUCCESS) {
  throw new Error(`Formula-driven Shape failed: ${JSON.stringify(result)}`);
}
return { shapeId: shape.getId(), formula: shape.getFormula(), result };
```

## Base Source binding

For a Base source, build a table-column reference:

```js
const sourceUnit = univerAPI.getBase("<source-base-unit-id>");
if (!sourceUnit) throw new Error("Source Base Unit was not found");

const reference = univerAPI.getFormula().buildReference({
  hostUnitId: hostUnit.getId(),
  unit: {
    unitId: sourceUnit.getId(),
    formulaQualifier: sourceUnit.getName(),
  },
  target: {
    kind: univerAPI.Enum.FormulaReferenceType.TABLE_COLUMN,
    tableName: "Budget",
    columnName: "Amount",
  },
});
```

`tableName` must be the Source Base's real OOXML formula identifier and `columnName` the real field name. Never pass `table` as a placeholder. For a Shape, use `UNIVER_BASE` in `externalReferences`.

## Existing formula text

For hand-written or imported formula text, persist the Host mapping first and fail when rejected:

```js
const qualifier = sourceUnit.getName();
const bound = formula.upsertExternalReference({
  unitId: hostUnit.getId(),
  qualifier,
  sourceUnitId: sourceUnit.getId(),
  sourceUnitType: univerAPI.Enum.UniverInstanceType.UNIVER_SHEET,
});
if (!bound) throw new Error("Cross-Unit Source binding failed");
const applied = formula.onCalculationResultApplied(30_000);
hostSheet.getRange("C1").setFormula(`=SUM('[${qualifier}]Sheet1'!B2:B10)`);
await applied;
```

The qualifier in formula text and metadata must match exactly. After rebinding, rewrite the formula and await calculation; `executeCalculation()` alone does not necessarily reparse an existing formula against new Host metadata. Prefer `buildReference()` for names requiring quoting.

## Host Shape differences

| Host | Create Shape | Read by stable ID |
| --- | --- | --- |
| Sheet | `worksheet.insertShape(...)` | `worksheet.getShape(shapeId)` |
| Doc | `document.insertShape(...)` | `document.getShape(shapeId)` |
| Slide | `slide.insertShape(...)` | `slide.getShape(shapeId)` |
| Board | `board.insertShape(...)` | `board.getShape(shapeId)` |

Once a live Shape exists, formula APIs are identical. Fully qualify the source so behavior does not depend on implicit active context.

## Update and remove

`FRange.setFormula()` replaces a cell formula. `FShape.setFormula()` replaces a Shape formula. A referenced Source mutation schedules recalculation; subscribe before changing it:

```js
const applied = univerAPI.getFormula().onCalculationResultApplied(30_000);
sourceSheet.getRange("B2").setValue({ v: 750, t: 2 });
await applied;
const updated = shape.getFormulaResult();
```

Format a formula-driven Shape with `setFormulaNumberFormat` and control its supported formula animation with `setFormulaAnimationEnabled`. `shape.removeFormula()` converts it to a regular Shape while preserving content and style; use Host deletion only when the Shape itself should be removed.

## Acceptance

After the final mutation:

1. For a cell, resolve a fresh range and assert exact formula plus expected cached value.
2. For a Shape, resolve by stable ID and assert `isFormulaShape()`, exact formula, and successful result with expected raw value, display text, and number format.
3. Change one referenced Source value, await calculation, and prove the consumer changes as expected.
4. Inspect Host and Source Units, then follow the Host Unit Skill's `univer_screenshot` workflow. Confirm the selected cell or Shape renders, the UI remains responsive, and geometry, number format, and clipping are correct in the returned image. Browser availability of an unloaded external Source is product-dependent; do not claim a visually updated result unless the captured View resolves it.
5. Complete the `univer` readback, ready, and status workflow.

Headless model readback is the calculation evidence. Do not claim Viewer resolution of an unloaded Source unless the actual preview demonstrates it.
