import * as vscode from 'vscode';
import { EditError } from './core/edits';
import type { EditIntent } from './shared/protocol';
import { applyIntentToDocument } from './editor/applyEdit';
import { DotenvEditorProvider } from './editor/DotenvEditorProvider';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    DotenvEditorProvider.register(context),
    vscode.commands.registerCommand('dotenvManager.openEditor', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) {
        void vscode.window.showInformationMessage('Open a .env file first.');
        return;
      }
      await vscode.commands.executeCommand('vscode.openWith', target, DotenvEditorProvider.viewType);
    }),
    vscode.commands.registerCommand('dotenvManager.sortAll', async (uri?: vscode.Uri) => {
      const target = uri ?? activeEnvUri();
      if (!target) {
        void vscode.window.showInformationMessage('Open a .env file first.');
        return;
      }
      await applyIntentToDocument(await vscode.workspace.openTextDocument(target), { type: 'sortAll' });
    }),
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
}

/** URI of the active .env document, whether shown as text or in the Dotenv Manager editor. */
function activeEnvUri(): vscode.Uri | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (input instanceof vscode.TabInputCustom && input.viewType === DotenvEditorProvider.viewType) {
    return input.uri;
  }
  return vscode.window.activeTextEditor?.document.uri;
}

export function deactivate(): void {}
