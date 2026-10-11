import * as vscode from 'vscode';
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
  );
}

export function deactivate(): void {}
