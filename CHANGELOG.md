# Changelog

## 0.0.1 — 2026-10-11

Initial release.

- Visual custom editor for `.env`, `.env.*` and `*.env` files that stays in sync with the text editor and supports undo/redo.
- Groups (`# === Name ===` headers) with group comments, and comments above each variable.
- Add, edit, rename and delete variables and groups; masked values with per-row and global reveal; export toggle; duplicate-key badges.
- Drag-and-drop and Alt+Up/Alt+Down reordering of variables (within and across groups) and of groups.
- Sort A→Z per group or for all groups (also the `Dotenv Manager: Sort All Groups A→Z` command).
- dotenv-expand style references (`${VAR}`, `$VAR`, `${VAR:-default}`, `${VAR-default}`): resolved preview, `${` autocompletion, warnings for undefined references and cycles in the GUI and the Problems panel, and renaming that can update references.
- "Open with Dotenv Manager" in the Explorer and editor-tab context menus, and as an icon button in the editor title bar.
- Lossless round-trip: lines you don't edit are written back exactly as they were.
