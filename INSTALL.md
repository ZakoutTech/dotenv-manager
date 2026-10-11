# Installing Dotenv Manager locally

Dotenv Manager isn't on the VS Code Marketplace or Open VSX yet. You install it from a `.vsix` package that you build from this repository. The same `.vsix` works in **VS Code** and **Cursor**.

- Extension ID: `zakout.dotenv-manager`
- Needs VS Code **1.100** or newer (in Cursor, the VS Code version it is built on must be 1.100 or newer; see [If Cursor refuses to install it](#if-cursor-refuses-to-install-it))

## 1. Build the `.vsix`

You need [Node.js](https://nodejs.org/) 20 or newer and npm.

```sh
git clone <repo-url> dotenv-manager
cd dotenv-manager
npm install
npm run package
```

`npm run package` makes a production bundle in `dist/` and writes `dotenv-manager-<version>.vsix` (for example `dotenv-manager-0.0.1.vsix`) to the repository root.

> If someone sent you a ready-made `.vsix`, skip this step.

## 2. Install in VS Code

### Option A: from the UI

1. Open the **Extensions** view (<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> on macOS, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> on Windows/Linux).
2. Click the **⋯** (Views and More Actions) menu at the top of the view.
3. Choose **Install from VSIX…** and select the `.vsix` file.
4. Reload the window if VS Code asks you to.

You can also drag the `.vsix` file from Finder/Explorer onto the Extensions view, or run **Extensions: Install from VSIX…** from the Command Palette.

### Option B: from the terminal

```sh
code --install-extension dotenv-manager-0.0.1.vsix
```

If `code` isn't found, open the Command Palette in VS Code and run **Shell Command: Install 'code' command in PATH** (on Windows and Linux the installer usually adds it already).

## 3. Install in Cursor

Cursor is built on VS Code and installs the same `.vsix`.

### Option A: from the UI

1. Open the **Extensions** view (<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>).
2. Click the **⋯** menu at the top of the view and choose **Install from VSIX…**, or run **Extensions: Install from VSIX…** from the Command Palette (<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>).
3. Select the `.vsix` file and reload the window if Cursor asks you to.

Dragging the `.vsix` onto the Extensions view also works.

### Option B: from the terminal

```sh
cursor --install-extension dotenv-manager-0.0.1.vsix
```

If `cursor` isn't found, open the Command Palette in Cursor and run **Shell Command: Install 'cursor' command in PATH**.

### If Cursor refuses to install it

An error like *"Unable to install extension … as it is not compatible with VS Code '1.x.y'"* means your Cursor is built on a VS Code version older than 1.100. Check the version under **Cursor → About Cursor** (macOS) or **Help → About** (Windows/Linux); the line that says **VSCode Version** is the one that matters. Update Cursor to fix it.

## 4. Check that it works

1. Open a folder that contains a `.env`, `.env.*` or `*.env` file.
2. Right-click the file in the Explorer and choose **Open with Dotenv Manager**, or click the **E** button in the editor title bar.

The extension should also be listed under **Installed** in the Extensions view as **Dotenv Manager**.

## Updating

Rebuild the `.vsix` and install it again. To reinstall the same version number over an existing install, add `--force`:

```sh
npm run package
code --install-extension dotenv-manager-0.0.1.vsix --force     # VS Code
cursor --install-extension dotenv-manager-0.0.1.vsix --force   # Cursor
```

Bumping `version` in `package.json` before packaging makes it easier to tell builds apart.

## Uninstalling

Find **Dotenv Manager** in the Extensions view and click **Uninstall**, or run:

```sh
code --uninstall-extension zakout.dotenv-manager     # VS Code
cursor --uninstall-extension zakout.dotenv-manager   # Cursor
```

## Running without installing

To try changes without installing anything, open this repository in VS Code (or Cursor) and press <kbd>F5</kbd>. This starts an **Extension Development Host** window with the extension loaded from source. See [Development](README.md#development) in the README.
