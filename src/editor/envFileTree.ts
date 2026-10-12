import * as vscode from 'vscode';
import type { EnvFile } from '../core/envFileList';
import type { EnvFileIndex } from './envFileIndex';

export type EnvTreeNode = { kind: 'folder'; name: string; index: number } | ({ kind: 'file' } & EnvFile);

const dirOf = (relativePath: string): string => (relativePath.includes('/') ? relativePath.slice(0, relativePath.lastIndexOf('/')) : '');

/** "Dotenv Files" view: the detected files, grouped by workspace folder in multi-root workspaces. */
export class EnvFileTreeProvider implements vscode.TreeDataProvider<EnvTreeNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  private readonly subscription: vscode.Disposable;

  readonly onDidChangeTreeData = this.changed.event;

  constructor(private readonly index: EnvFileIndex) {
    this.subscription = index.onDidChange(() => this.changed.fire());
  }

  getChildren(node?: EnvTreeNode): EnvTreeNode[] {
    const files = this.index.list();
    if (!node) {
      const folders = vscode.workspace.workspaceFolders ?? [];
      if (folders.length > 1) {
        return folders
          .filter((folder) => files.some((f) => f.folderIndex === folder.index))
          .map((folder) => ({ kind: 'folder', name: folder.name, index: folder.index }));
      }
      return files.map((f) => ({ kind: 'file', ...f }));
    }
    return node.kind === 'folder' ? files.filter((f) => f.folderIndex === node.index).map((f) => ({ kind: 'file', ...f })) : [];
  }

  getTreeItem(node: EnvTreeNode): vscode.TreeItem {
    if (node.kind === 'folder') {
      const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.Expanded);
      item.iconPath = new vscode.ThemeIcon('root-folder');
      item.contextValue = 'dotenvManager.folder';
      return item;
    }
    const uri = vscode.Uri.parse(node.uri);
    const item = new vscode.TreeItem(uri);
    item.description = dirOf(node.relativePath);
    item.tooltip = node.relativePath;
    item.contextValue = 'dotenvManager.envFile';
    item.command = { command: 'vscode.open', title: 'Open', arguments: [uri] };
    return item;
  }

  dispose(): void {
    this.subscription.dispose();
    this.changed.dispose();
  }
}

export function registerEnvFileTree(context: vscode.ExtensionContext, index: EnvFileIndex): EnvFileTreeProvider {
  const provider = new EnvFileTreeProvider(index);
  context.subscriptions.push(
    provider,
    vscode.window.createTreeView('dotenvManager.files', { treeDataProvider: provider, showCollapseAll: true }),
  );
  return provider;
}
