# Plan: Dotenv Manager — VS Code extension with a visual .env editor

## Goal

A VS Code extension that opens `.env` files in a GUI (custom editor) where users can create variables, drag and drop them to reorder (the file is rewritten in that order), add a comment above each variable, group variables under a commented header, sort variables alphabetically within each group, and use dotenv-expand style references (`VARIABLE_Y=${VARIABLE_X}`).

## File format conventions (decided)

The GUI must round-trip any `.env` file without losing content. Structure is inferred from comments and blank lines:

```dotenv
# === Database ===
# Connection settings for the primary Postgres instance

# Hostname of the DB server
DB_HOST=localhost
DB_PORT=5432
DB_URL=postgres://${DB_HOST}:${DB_PORT}/app

# === API ===
API_KEY="abc 123"
```

- **Group header**: a line matching `# === <Name> ===`. Comment lines directly below it (before the first blank line) are the **group comment**.
- **Variable comment**: contiguous `#` lines directly above a variable with no blank line between.
- Variables before the first header belong to an implicit "Ungrouped" group.
- Preserved verbatim: `export` prefix, quote style (`'`, `"`, none), inline `# comments`, multiline double-quoted values, unknown lines.

## Tech choices (decided)

TypeScript, esbuild bundle, `CustomTextEditorProvider` (so the TextDocument stays the source of truth and native undo/redo/save/dirty state work), webview UI in plain TS with VS Code theme CSS variables, Vitest for pure-logic units, `@vscode/test-electron` for integration tests.

---

## Step 1 — Scaffold the extension

Create the extension project: `package.json` with `contributes.customEditors` for `*.env`, `.env`, `.env.*` (priority `option` so the text editor stays default), an "Open with Dotenv Manager" command, esbuild build for extension + webview bundles, Vitest and `@vscode/test-electron` wired up, ESLint, `.vscodeignore`.

Acceptance: `npm run build` produces both bundles; `npm test` runs green; launching the Extension Development Host shows "Dotenv Manager" in "Reopen Editor With…" for a `.env` file.

Out of scope: any parsing or UI beyond an empty placeholder webview.

## Step 2 — Implement the lossless .env parser and serializer

Implement `parse(text) -> EnvDocument` and `serialize(EnvDocument) -> string` in a pure module (no `vscode` import). Model: `EnvDocument { groups: Group[] }`, `Group { name, comment[], entries[] }`, `Entry { key, rawValue, quote, exported, comment[], inlineComment }`, plus preserved unknown lines. Follow the conventions above.

Acceptance: `serialize(parse(x)) === x` for a fixture corpus (quotes, export, multiline, CRLF, missing trailing newline, unknown lines, empty file); group headers, group comments and variable comments land in the right model fields; ≥90% line coverage on the module.

Out of scope: variable expansion; any UI.

## Step 3 — Implement dotenv-expand reference resolution

Pure module `resolve(EnvDocument) -> Map<key, Resolution>` supporting `${VAR}`, `$VAR`, `${VAR:-default}`, and escaped `\$`; no expansion inside single-quoted values (dotenv-expand semantics). Report undefined references and reference cycles as diagnostics instead of throwing.

Acceptance: `VARIABLE_X=123`, `VARIABLE_Y=${VARIABLE_X}` resolves Y to `123`; chained, default, single-quote and escaped cases are unit-tested; `A=${B}`,`B=${A}` yields a cycle diagnostic for both keys.

## Step 4 — Implement the custom editor and document↔webview sync

Implement `DotenvEditorProvider` (`CustomTextEditorProvider`). The extension parses the TextDocument and posts the model to the webview; the webview sends typed edit intents (`addVariable`, `updateVariable`, `deleteVariable`, `moveVariable`, `addGroup`, `renameGroup`, `updateComment`, `sortGroup`, …); the extension applies them to the model, serializes, and writes back with a single `WorkspaceEdit`. External text edits re-sync the webview. Use a strict CSP with a nonce.

Acceptance: each intent produces exactly one undo step; editing the file in the text editor side-by-side updates the GUI live; an integration test opens a fixture, sends an intent, and asserts the resulting file text.

## Step 5 — Build the GUI: groups, variables and comments

Webview renders groups as collapsible cards (name + group comment) containing variable rows (comment above, key, value, export toggle). Supports add/edit/delete for variables and groups, inline editing of variable and group comments, key validation (`[A-Za-z_][A-Za-z0-9_]*`, duplicate-key warning), and themed styling via VS Code CSS variables. Values are masked by default with a reveal toggle.

Acceptance: every CRUD action round-trips to the file through Step 4 intents; invalid keys are rejected with an inline message; keyboard-only operation works.

## Step 6 — Add drag-and-drop reordering

Drag variable rows to reorder within a group or move them into another group; drag group cards to reorder groups. The variable's comment moves with it. Provide keyboard alternatives (Alt+Up/Alt+Down). Each drop issues one `moveVariable`/`moveGroup` intent.

Acceptance: dropping a variable writes the file in the new order with its comment attached; moving across groups places it under the target header; one drop = one undo step.

## Step 7 — Add alphabetical sort by group

"Sort A→Z" button on each group card plus a "Sort all groups" toolbar action and a `dotenvManager.sortAll` command. Sorting is per group (group order is kept), case-insensitive, stable, and carries each variable's comment along.

Acceptance: sorting a group reorders only that group's variables with comments attached; sort-all leaves group order untouched; the command also works from the text editor.

Out of scope: auto-sort on save.

## Step 8 — Add reference awareness to the GUI

Use Step 3 to show each value's resolved result next to the raw value, autocomplete existing keys when typing `${` in a value field, and mark undefined references and cycles with warnings (also surfaced as VS Code diagnostics on the text document). Renaming a variable offers to update `${OLD}` references.

Acceptance: `VARIABLE_Y=${VARIABLE_X}` shows `→ 123`; an undefined reference warns in both the GUI and the Problems panel; rename-with-update rewrites all references in one undo step.

## Step 9 — Write README and packaging docs

Document the file conventions, features, commands and settings in the README with screenshots, add a CHANGELOG, and confirm `vsce package` produces a `.vsix`.
