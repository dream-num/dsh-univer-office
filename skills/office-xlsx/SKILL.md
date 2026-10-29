---
name: office-xlsx
description: Read, create, edit, and validate Excel workbooks, data, and formulas (.xlsx) through Univer Sheet Units and the structured univer_* tools.
---

# Excel workbooks

This deployment handles Excel workbooks through Univer. Call the `skill` tool with `univer`, then with `univer-sheet`, and follow both. Do not use openpyxl, `load_workspace_dependencies`, ZIP or XML manipulation, or another writer for `.xlsx`, `.csv`, or `.tsv` content.

- Existing workbook or delimited data: import it into a `.univer` draft worktree with `univer_import`, then read or edit the imported Sheet Unit.
- New workbook: create a Sheet Unit with `univer_unit` in a draft worktree and author it there.
- Recalculate formulas as `univer-sheet` describes, and read the calculated values back before reporting or exporting them.
- Deliver `.xlsx`, `.csv`, or `.tsv` with `univer_export` from the verified Sheet Unit when the user expects a file, or a PDF with `univer_print_pdf`.
