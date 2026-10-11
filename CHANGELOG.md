# Changelog

## 0.0.1 — 2026-10-11

Initial release.

- Visual custom editor for `.env` files that stays in sync with the text editor and supports undo/redo.
- `dotenvManager.envFiles` setting: the only file names that are detected and opened (default `.env`, `.env.local`, `.env.development`, `.env.production`, `.env.test`, `.env.example`). Other files, such as `.env.ts`, keep their own editors.
- Groups (`# === Name ===` headers) with group comments, and comments above each variable.
- Add, edit, rename and delete variables and groups; masked values with per-row and global reveal; export toggle; duplicate-key badges.
- Drag-and-drop and Alt+Up/Alt+Down reordering of variables (within and across groups) and of groups.
- Sort A→Z per group or for all groups (also the `Dotenv Manager: Sort All Groups A→Z` command).
- dotenv-expand style references (`${VAR}`, `$VAR`, `${VAR:-default}`, `${VAR-default}`): resolved preview, `${` autocompletion, warnings for undefined references and cycles in the GUI and the Problems panel, and renaming that can update references.
- "Open with Dotenv Manager" in the Explorer and editor-tab context menus, and as an icon button in the editor title bar.
- Opens `.env` files in Dotenv Manager by default. Choose the default editor with the `dotenvManager.defaultView` setting, the toolbar dropdown or the **Choose Default Editor for .env Files** command; **Open as Text** switches back.
- Status bar item **Dotenv Manager (n)** with a quick pick of all `.env` files in the workspace, and a **Dotenv Files** view in the Explorer; detection is recursive, skips dependency/build folders and updates live.
- **Create .env File…** from the selector, the Dotenv Files view or a folder's Explorer context menu (never overwrites), and the `dotenvManager.exclude` glob setting for detection.
- Commented-out variables (`# KEY=value`): shown on demand with **Show commented (n)**, and switched with **Comment out** / **Uncomment** on each row.
- **Save** button at the start of the toolbar, enabled while the file has unsaved changes.
- **Preview** toolbar checkbox: shows the highlighted .env text in a read-only pane to the right, following **Show values**.
- Lossless round-trip: lines you don't edit are written back exactly as they were.
