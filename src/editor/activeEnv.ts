import * as vscode from 'vscode';
import { DOTENV_VIEW_TYPE } from '../shared/associations';
import { isEnvFile } from './envFileSettings';

/** URI of the active .env document, whether shown as text or in the Dotenv Manager editor. */
export function activeEnvUri(): vscode.Uri | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (input instanceof vscode.TabInputCustom && input.viewType === DOTENV_VIEW_TYPE) {
    return input.uri;
  }
  const uri = vscode.window.activeTextEditor?.document.uri;
  // Commands can also be run from keybindings, which ignore menu `when` clauses: never act on other files.
  return uri && isEnvFile(uri) ? uri : undefined;
}

/**
 * Command argument → file URI. Commands receive a Uri from the Explorer and editor menus,
 * and an `{ uri }` node from the Dotenv Files view.
 */
export function targetUri(arg: unknown): vscode.Uri | undefined {
  if (arg instanceof vscode.Uri) {
    return arg;
  }
  if (arg && typeof arg === 'object' && 'uri' in arg && typeof arg.uri === 'string') {
    return vscode.Uri.parse(arg.uri);
  }
  return activeEnvUri();
}
