---
name: office-pptx
description: Create, read, edit, and validate PowerPoint presentations (.pptx) through Univer Slide Units and the structured univer_* tools.
---

# PowerPoint presentations

This deployment handles PowerPoint presentations through Univer. Call the `skill` tool with `univer`, then with `univer-slide`, and follow both. Do not use python-pptx, `load_workspace_dependencies`, ZIP or XML manipulation, or another writer for `.pptx` content.

- Existing `.pptx`: import it into a `.univer` draft worktree with `univer_import`, then read or edit the imported Slide Unit.
- New presentation: create a Slide Unit with `univer_unit` in a draft worktree and author it there.
- Deliver a `.pptx` with `univer_export` from the verified and linted Slide Unit when the user expects a PowerPoint file, or a PDF with `univer_print_pdf`.
