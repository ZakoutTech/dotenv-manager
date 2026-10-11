import * as vscode from 'vscode';
import { EditError } from './core/edits';
import type { EnvFile } from './core/envFileList';
import { literalEnvFileNames } from './shared/envFiles';
import type { EditIntent } from './shared/protocol';
import { targetUri } from './editor/activeEnv';
import { applyIntentToDocument } from './editor/applyEdit';
import { createEnvFile } from './editor/createEnvFile';
import { registerDefaultView } from './editor/defaultView';
import { registerDiagnostics } from './editor/diagnostics';
import { EnvFileIndex } from './editor/envFileIndex';
import { configuredEnvFiles, ENV_FILES_SETTING } from './editor/envFileSettings';
import { selectEnvFile } from './editor/envFilePicker';
import { registerEnvFileTree, type EnvFileTreeProvider } from './editor/envFileTree';
import { reopenWith } from './editor/reopen';
import { registerStatusBar } from './editor/statusBar';
import { DotenvEditorProvider } from './editor/DotenvEditorProvider';

/** Returned from activate(); used by the integration tests. */
export interface DotenvManagerApi {
  envFiles(): EnvFile[];
  rescan(): Promise<void>;
  tree: EnvFileTreeProvider;
}

function withTarget(run: (uri: vscode.Uri) => Promise<unknown>): (arg?: unknown) => Promise<void> {
  return async (arg) => {
    const uri = targetUri(arg);
    if (!uri) {
      void vscode.window.showInformationMessage('Open a .env file first.');
      return;
    }
    await run(uri);
  };
}

/**
 * Menus show "Open with Dotenv Manager" for `resourceFilename in dotenvManager.envFileNames`:
 * the literal names of the envFiles setting plus the names of the detected files (for glob patterns).
 */
function registerMenuContext(context: vscode.ExtensionContext, index: EnvFileIndex): void {
  const update = (): void => {
    const detected = index.list().map((f) => f.relativePath.slice(f.relativePath.lastIndexOf('/') + 1));
    const names = [...new Set([...literalEnvFileNames(configuredEnvFiles()), ...detected])];
    void vscode.commands.executeCommand('setContext', 'dotenvManager.envFileNames', names);
  };
  update();
  context.subscriptions.push(
    index.onDidChange(update),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ENV_FILES_SETTING)) {
        update();
      }
    }),
  );
}

export function activate(context: vscode.ExtensionContext): DotenvManagerApi {
  const index = new EnvFileIndex();
  context.subscriptions.push(index);
  registerMenuContext(context, index);

  registerDiagnostics(context);
  registerDefaultView(context);
  registerStatusBar(context, index);
  const tree = registerEnvFileTree(context, index);

  context.subscriptions.push(
    DotenvEditorProvider.register(context),
    vscode.commands.registerCommand(
      'dotenvManager.openEditor',
      withTarget((uri) => reopenWith(uri, DotenvEditorProvider.viewType)),
    ),
    vscode.commands.registerCommand(
      'dotenvManager.openText',
      withTarget((uri) => reopenWith(uri, 'default')),
    ),
    vscode.commands.registerCommand(
      'dotenvManager.sortAll',
      withTarget(async (uri) => applyIntentToDocument(await vscode.workspace.openTextDocument(uri), { type: 'sortAll' })),
    ),
    vscode.commands.registerCommand('dotenvManager.selectEnvFile', () => selectEnvFile(index)),
    vscode.commands.registerCommand('dotenvManager.refreshEnvFiles', () => index.rescan()),
    vscode.commands.registerCommand('dotenvManager.createEnvFile', createEnvFile),
    // Internal: apply an edit intent to a .env document (used by commands and tests).
    vscode.commands.registerCommand('dotenvManager.applyEdit', async (uri: vscode.Uri, intent: EditIntent) => {
      const document = await vscode.workspace.openTextDocument(uri);
      try {
        return await applyIntentToDocument(document, intent);
      } catch (err) {
        if (err instanceof EditError) {
          void vscode.window.showErrorMessage(err.message);
          return false;
        }
        throw err;
      }
    }),
  );

  return { envFiles: () => index.list(), rescan: () => index.rescan(), tree };
}

export function deactivate(): void {}
