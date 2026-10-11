# Dotenv Manager

A visual editor for `.env` files in VS Code. Organize variables into commented groups, reorder them with drag and drop, sort each group A→Z and see what `${VAR}` references resolve to, while the file on disk stays a plain `.env` file.

![Dotenv Manager editing a .env file](images/screenshot.png)

## Features

- **Groups and comments.** Put variables in named groups, and add a comment above any variable or on a group.
- **Drag and drop.** Reorder variables within a group, move them to another group, or reorder whole groups. The file is rewritten in the new order.
- **Keyboard moves.** <kbd>Alt</kbd>+<kbd>↑</kbd> / <kbd>Alt</kbd>+<kbd>↓</kbd> move the focused variable or group.
- **Sort A→Z per group.** Sort one group from its card, or every group with **Sort all A→Z** (also in the Command Palette). Group order is never changed, and comments move with their variable.
- **`${VAR}` references** ([dotenv-expand](https://github.com/motdotla/dotenv-expand) syntax):
  - `${VAR}`, `$VAR`, `${VAR:-default}` and `${VAR-default}` show their resolved value next to the raw value.
  - Typing `${` in a value suggests existing variable names.
  - Undefined references and reference cycles appear as warnings in the editor and in the **Problems** panel.
  - Renaming a variable offers to update every reference to it.
- **Masked values.** Values are hidden until you click **Show** on a row or tick **Show values**.
- **Safe editing.** Every action is a normal edit to the text document, so undo/redo, save and the unsaved-changes marker work as usual. You can keep the text editor open beside the GUI; both stay in sync.
- **Lossless.** Lines you don't touch are written back exactly as they were: quotes, `export`, inline comments, multiline values, CRLF line endings and lines the parser doesn't understand.

## Usage

`.env`, `.env.*` and `*.env` files open in Dotenv Manager by default. To open one in Dotenv Manager from elsewhere (for example when you chose the text editor as default):

- right-click it in the **Explorer** and choose **Open with Dotenv Manager**,
- click the **Open with Dotenv Manager** button (the **E** icon) in the editor title bar,
- run **Dotenv Manager: Open with Dotenv Manager** from the Command Palette, or
- right-click the editor tab and choose **Open with Dotenv Manager** (or **Reopen Editor With… → Dotenv Manager**).

To see the raw text, click **Open as text** in the Dotenv Manager toolbar or the **Open as Text** button in the editor title bar. The two views replace each other in the same tab. If the file has unsaved changes, both tabs stay open so nothing is lost.

### Choosing the default editor

Pick which editor opens `.env` files in any of these places:

- the **Open .env files with** dropdown in the Dotenv Manager toolbar,
- **Dotenv Manager: Choose Default Editor for .env Files** in the Command Palette,
- the **Dotenv Manager › Default View** setting (`dotenvManager.defaultView`: `visual` or `text`).

Dotenv Manager applies the choice by updating the matching entries in VS Code's `workbench.editorAssociations` setting. It writes to your user settings, or to the workspace settings if you set `dotenvManager.defaultView` per workspace.

| Action | How |
|---|---|
| Edit a key, value or comment | Click it. <kbd>Enter</kbd> saves, <kbd>Shift</kbd>+<kbd>Enter</kbd> adds a line break, <kbd>Esc</kbd> cancels. |
| Add a variable | **+ Variable** on a group card |
| Add a group | **+ Group** in the toolbar |
| Move a variable or group | Drag the ⠿ handle, or <kbd>Alt</kbd>+<kbd>↑</kbd> / <kbd>Alt</kbd>+<kbd>↓</kbd> |
| Sort | **Sort A→Z** on a group, **Sort all A→Z** in the toolbar |
| Delete a group | **Delete** on the group card. You can keep its variables; they move to the group above. |

## File format

Dotenv Manager reads structure from ordinary comments, so the file still works with every dotenv loader:

```dotenv
# === Database ===
# Connection settings for the primary Postgres instance

# Hostname of the DB server
DB_HOST=localhost
DB_PORT=5432
DB_URL=postgres://${DB_HOST}:${DB_PORT}/app
```

- **Group header:** a line of the form `# === Name ===`.
- **Group comment:** comment lines directly below the header, up to the first blank line.
- **Variable comment:** comment lines directly above a variable, with no blank line in between.
- **Ungrouped:** variables before the first header.
- **Free comments:** comment blocks followed by a blank line belong to no variable and are kept where they are.

When the GUI moves or sorts variables, it inserts a blank line where needed so a comment can't end up attached to the wrong variable or group.

## Settings

| Setting | Default | Description |
|---|---|---|
| `dotenvManager.defaultView` | `visual` | Editor used when you open a `.env` file: `visual` (Dotenv Manager) or `text` |

## Commands

| Command | Description |
|---|---|
| `Dotenv Manager: Open with Dotenv Manager` | Open the current `.env` file in the visual editor |
| `Dotenv Manager: Open as Text` | Show the current `.env` file in the text editor |
| `Dotenv Manager: Choose Default Editor for .env Files` | Choose whether `.env` files open in Dotenv Manager or as text |
| `Dotenv Manager: Sort All Groups A→Z` | Sort the variables of every group. Works from the text editor too. |

## Notes

- References resolve against the variables in the same file only, never your shell's environment, so the editor shows what the file itself defines.
- When a key is defined more than once, the last definition wins (as in dotenv), and both rows are marked **duplicate**.
- Editing a value re-formats that one line (for example `KEY = value` becomes `KEY=value`). Lines you don't edit are left as they are.

## Development

To install the extension from a local build (VS Code or Cursor) without the Marketplace, see [INSTALL.md](INSTALL.md).

```sh
npm install
npm run build            # bundle extension and webview into dist/
npm test                 # unit tests (Vitest)
npm run test:integration # integration tests in a downloaded VS Code
npm run lint
npm run package          # build a .vsix
npm run preview          # GUI in the browser at http://127.0.0.1:5178/
npm run install:cursor   # package and install into Cursor (install:code for VS Code)
```

- **In VS Code:** press <kbd>F5</kbd> (**Run Extension**) to start an Extension Development Host with the `test/fixtures` workspace. Keep `npm run watch` running and use **Developer: Reload Webviews** to pick up GUI changes, or **Developer: Open Webview Developer Tools** to inspect them.
- **In a browser:** `npm run preview` serves the GUI with a fake extension host (`preview/host.ts`) that runs the real parse → edit → serialize code against a sample file. The right pane shows the resulting `.env` text and is editable, and there are Undo/Redo, Reset and a light/dark theme toggle. Saving files under `src/` rebuilds and reloads the page. Set `PORT` to change the port.

## License

[MIT](LICENSE)
