---
name: office
description: Create, edit, inspect, or convert Office documents, spreadsheets, and presentations through Univer and the structured univer_* tools. Load to choose the relevant workflow.
---

# Office task routing

This deployment handles Office content through Univer. Call the `skill` tool with `univer` first, then with the matching Unit skill, before creating, reading, or editing Office files:

- Word (`.docx`): `univer-doc`.
- Excel (`.xlsx`, `.csv`, `.tsv`): `univer-sheet`.
- PowerPoint (`.pptx`): `univer-slide`.

Do not use python-docx, openpyxl, python-pptx, `load_workspace_dependencies`, ZIP or XML manipulation, or another writer for Office content.

Import an existing Office file into a `.univer` draft worktree with `univer_import`, author and verify the Unit there, and export with `univer_export` when the user expects an Office file. Use `univer_screenshot` for visual inspection and `univer_print_pdf` for PDF output of Univer content. `office-render`, `office-recalculate`, and `office-export-pdf` remain available only for LibreOffice Kit operations on Office files that do not pass through Univer.
