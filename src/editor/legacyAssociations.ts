import * as vscode from 'vscode';
import { DOTENV_VIEW_TYPE, withoutDotenvAssociations } from '../shared/associations';
import { configuredEnvFiles } from './envFileSettings';

const DONE_KEY = 'dotenvManager.legacyAssociationsRemoved';

/**
 * Earlier versions made Dotenv Manager the default editor through `workbench.editorAssociations`.
 * Remove those entries once per scope, so .env files open as text again. Runs only once, so a
 * user who later makes Dotenv Manager the default ("Configure default editor") keeps that choice.
 */
export async function removeLegacyAssociations(context: vscode.ExtensionContext): Promise<void> {
  const scopes = [
    { state: context.globalState, target: vscode.ConfigurationTarget.Global, value: 'globalValue' as const },
    { state: context.workspaceState, target: vscode.ConfigurationTarget.Workspace, value: 'workspaceValue' as const },
  ];
  for (const { state, target, value } of scopes) {
    if (state.get<boolean>(DONE_KEY) || (target === vscode.ConfigurationTarget.Workspace && !vscode.workspace.workspaceFolders)) {
      continue;
    }
    const workbench = vscode.workspace.getConfiguration('workbench');
    const current = workbench.inspect<Record<string, string>>('editorAssociations')?.[value];
    const next = withoutDotenvAssociations(current, DOTENV_VIEW_TYPE, configuredEnvFiles());
    if (next) {
      await workbench.update('editorAssociations', Object.keys(next).length > 0 ? next : undefined, target);
    }
    await state.update(DONE_KEY, true);
  }
}
