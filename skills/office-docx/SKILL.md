---
name: office-docx
description: Create, read, edit, and validate Word documents (.docx) through Univer Doc Units and the structured univer_* tools.
---

# Word documents

This deployment handles Word documents through Univer. Call the `skill` tool with `univer`, then with `univer-doc`, and follow both. Do not use python-docx, `load_workspace_dependencies`, ZIP or XML manipulation, or another writer for `.docx` content.

- Existing `.docx`: import it into a `.univer` draft worktree with `univer_import`, then read or edit the imported Doc Unit.
- New document: create a Doc Unit with `univer_unit` in a draft worktree and author it there.
- Deliver a `.docx` with `univer_export` from the verified Doc Unit when the user expects a Word file, or a PDF with `univer_print_pdf`.
