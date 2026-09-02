---
name: univer-base
description: Create, edit, calculate, inspect, export, and review Univer Base database Units through DSH tools and the Lite Interface. Use proactively for Base tables, fields, records, views, Formula fields, structured references, Sheet-backed external references, Base import/export, or any Base Unit task.
---

# Univer Base Units

Load `univer` first. A Base is one Unit inside a `.univer` file:

```text
FUniver
└── FBase
    └── FBaseTable
        ├── FBaseTableField   schema and value contract
        ├── FBaseTableRecord  stored business data
        └── FBaseTableView    projection of the same table records
```

- Tables own their fields, records, and views; views only add filter, sort, group, visibility, and type-specific presentation.
- The primary field is the record's visible identity for links, cards, and details. Define it with `insertTable(..., { primaryFieldName })` instead of adding a duplicate label field.
- Use stable Unit/Table/Field/Record/View IDs in Facade relationships and user-facing names for display. Record values and view config normally refer to Field IDs.
- `table.getFormulaName()` is only the structured-reference name for formulas; it may differ from the table's display name.

## Entry

Create the Base with `univer_unit` in a draft worktree, then call `univer_inspect` with its `unitId` before editing. `univer_execute` predefines `univerAPI`, `api`, and the selected `FBase` as `base`. Use `base` directly; these bindings are reserved and must not be redeclared.

Do not call `createBase()` after `univer_unit` just to obtain a handle. A new Base already contains `Table 1` with a primary `Name` field and `Grid`; `insertTable()` also creates a Grid. Inspect first, then deliberately reuse, rename, or delete defaults.

## Exact API

Use `univer_api` to show:

- `FUniver.getBase`, `FBase`, `FBaseTable`, `FBaseTableField`, `FBaseTableRecord`, `FBaseTableView`
- `FEnum.BaseFieldType`, `FBase.insertTable`, `FBaseTable.addField`, `FBaseTable.addRecords`, `FBaseTable.createView`
- `IGridViewConfig`, `ICalendarViewConfig`, `IGalleryViewConfig`, `IGanttViewConfig`, `IKanbanViewConfig`, `ICardLayoutConfig`

Use focused discovery such as `recordLink` with the Base Unit filter. Follow every referenced child type: if a result says `card?: ICardLayoutConfig`, show `ICardLayoutConfig` instead of guessing its shape.

## Core contracts

- Add fields one at a time with `FBaseTable.addField(...)`; there is no `addFields` method.
- Single/MultiSelect options use `{ id, name, color? }`; records store option IDs, not labels.
- Progress values follow its configured range: with `{ start: 0, end: 100 }`, 75% is `75`, not `0.75`.
- Money uses `BaseFieldType.Currency` and numeric values; Number is not a semantic substitute.
- RecordLink config targets a Table ID and stores target Record IDs. Prefer its dedicated Facade methods when editing links.
- View config uses Field IDs. Kanban/Gallery card title and fields follow `ICardLayoutConfig`; `fieldSettings` does not replace the card contract.

## OOXML Base table formulas

Base Formula fields must use exact Excel structured references:

- `Table[[#This Row],[Column]]` or `Table[@[Column]]` reads one value from the formula record's row.
- `Table[[#Data],[Column]]` or `Table[Column]` reads the complete data column.
- Unqualified `[@[Column]]` is valid only for the current row of the Host table.
- `table[Column]` is invalid unless `table` is the real table identifier.

Resolve every table's formula identifier with `table.getFormulaName()`. It may differ from the display name when duplicated or illegal as an Excel table name.

```js
const ordersName = orders.getFormulaName();
const pricingName = pricing.getFormulaName();
orders.addField("Line Total", univerAPI.Enum.BaseFieldType.Formula, {
  field: {
    config: {
      formula: `=${ordersName}[[#This Row],[Quantity]]*${pricingName}[[#This Row],[Unit Price]]`,
    },
  },
  externalReferences: [],
});
```

A qualified `#This Row` reference to another Base table aligns by row position. Use it only when both tables deliberately share row order. For relational data, use a stable key or RecordLink with lookup logic. Use `#Data` only for intended full-column aggregation.

After writing a Formula field, subscribe to calculation completion before triggering the change, await it, and read computed record values. Stored formula text alone is not evidence.

## Formula fields with a Sheet source

Persist the complete external-reference binding with the Formula field:

```js
const table = base?.getTableById("<table-id>");
if (!table) throw new Error("Base table not found");

table.addField("Current Total", univerAPI.Enum.BaseFieldType.Formula, {
  field: {
    config: { formula: "=SUM('[Sales Source]Data'!B2:B4)" },
  },
  externalReferences: [
    {
      qualifier: "Sales Source",
      sourceUnitId: "<sheet-unit-id>",
      sourceUnitType: univerAPI.Enum.UniverInstanceType.UNIVER_SHEET,
    },
  ],
});
```

The formula qualifier and binding qualifier must match exactly. For broader cross-Unit formula work, load `univer-cross-unit-formula` as well.

## Verification

After the last write, check:

1. `univer_inspect` for tables, primary fields, field types and config, record counts, and view types. It is read-only and accepts no selector for Base.
2. In a fresh read-only `univer_execute`, explicitly `return` record values plus `view.getConfig()` / `view.getProjection()` for stored IDs and view bindings. For Formula fields, also verify formula source, external bindings, and calculated results.
3. Call `univer_screenshot` with the Base `unitId`, selected worktree or trunk, and an explicit workspace `output` directory. Inspect the returned full-workbench PNG for blank labels, exposed IDs, implausible dates/percentages, missing card fields, empty defaults, and the opening active table/view.

Base screenshots accept only common screenshot arguments; do not pass Sheet ranges, Slide pages, or Board selectors.

Base may export to `.xlsx`, `.csv`, or `.tsv` through `univer_export`. Await calculation and complete readback before export.
