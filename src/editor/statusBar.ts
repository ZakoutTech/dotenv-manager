import * as vscode from 'vscode';
import { statusBarText, statusBarTooltip } from '../core/envFileList';
import type { EnvFileIndex } from './envFileIndex';

/** "Dotenv Manager (n)" status bar item; clicking it opens the .env file selector. */
export function registerStatusBar(context: vscode.ExtensionContext, index: EnvFileIndex): void {
  const item = vscode.window.createStatusBarItem('dotenvManager.status', vscode.StatusBarAlignment.Right, 100);
  item.name = 'Dotenv Manager';
  item.command = 'dotenvManager.selectEnvFile';

  const update = (): void => {
    if (!vscode.workspace.getConfiguration('dotenvManager').get<boolean>('statusBar.enabled', true)) {
      item.hide();
      return;
    }
    const files = index.list();
    item.text = statusBarText(index.ready ? files.length : undefined, index.truncated);
    item.tooltip = new vscode.MarkdownString(statusBarTooltip(files, (vscode.workspace.workspaceFolders?.length ?? 0) > 1));
    item.show();
  };

  update();
  context.subscriptions.push(
    item,
    index.onDidChange(update),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('dotenvManager.statusBar.enabled')) {
        update();
      }
    }),
  );
}
