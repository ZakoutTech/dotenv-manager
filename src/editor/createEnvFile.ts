import * as vscode from 'vscode';
import { newEnvFilePathError, normalizeNewEnvFilePath } from '../shared/newEnvFile';
import { configuredEnvFiles } from './envFileSettings';

/**
 * Folder to create the file in: an Explorer folder, a "Dotenv Files" folder node, the only
 * workspace folder, or one the user picks in a multi-root workspace.
 */
async function baseFolder(arg: unknown): Promise<vscode.Uri | undefined> {
  if (arg instanceof vscode.Uri) {
    return arg;
  }
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (arg && typeof arg === 'object' && 'kind' in arg && arg.kind === 'folder' && 'index' in arg) {
    return folders[arg.index as number]?.uri;
  }
  if (folders.length === 0) {
    void vscode.window.showInformationMessage('Open a folder to create a .env file in it.');
    return undefined;
  }
  if (folders.length === 1) {
    return folders[0].uri;
  }
  return (await vscode.window.showWorkspaceFolderPick({ placeHolder: 'Workspace folder for the new .env file' }))?.uri;
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create an empty .env file and open it in the text editor. Never overwrites:
 * an existing file is offered for opening instead. `pathArg` skips the prompt (tests, links).
 */
export async function createEnvFile(arg?: unknown, pathArg?: string): Promise<vscode.Uri | undefined> {
  const base = await baseFolder(arg);
  if (!base) {
    return undefined;
  }
  const target = (input: string): vscode.Uri => vscode.Uri.joinPath(base, ...normalizeNewEnvFilePath(input).split('/'));

  const input =
    pathArg ??
    (await vscode.window.showInputBox({
      title: 'Create .env File',
      prompt: `Path relative to ${vscode.workspace.asRelativePath(base, true) || base.path}. Detected names: ${configuredEnvFiles().join(', ')}`,
      value: '.env',
      valueSelection: [0, 4],
      validateInput: async (value) =>
        newEnvFilePathError(value, configuredEnvFiles()) ??
        ((await exists(target(value))) ? `${normalizeNewEnvFilePath(value)} already exists.` : undefined),
    }));
  if (input === undefined) {
    return undefined;
  }
  const error = newEnvFilePathError(input, configuredEnvFiles());
  if (error) {
    void vscode.window.showErrorMessage(error);
    return undefined;
  }

  const uri = target(input);
  if (await exists(uri)) {
    // Don't wait for the notification: callers get their answer right away.
    void vscode.window.showWarningMessage(`${normalizeNewEnvFilePath(input)} already exists.`, 'Open').then((choice) => {
      if (choice === 'Open') {
        void vscode.commands.executeCommand('vscode.open', uri);
      }
    });
    return undefined;
  }
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
  await vscode.workspace.fs.writeFile(uri, new Uint8Array());
  await vscode.commands.executeCommand('vscode.open', uri);
  return uri;
}
