import * as vscode from 'vscode';
import { DOTENV_VIEW_TYPE, withoutDotenvAssociations } from '../shared/associations';
import { configuredEnvFiles } from './envFileSettings';

const SCOPES = [
  { target: vscode.ConfigurationTarget.Global, value: 'globalValue' as const },
  { target: vscode.ConfigurationTarget.Workspace, value: 'workspaceValue' as const },
];

/**
 * Dotenv Manager never opens .env files by default; it opens only through "Open with Dotenv
 * Manager". Earlier versions made it the default through `workbench.editorAssociations`, and an
 * old build (in another editor, or via Settings Sync) can write those entries back. Remove them
 * on every start and whenever the associations change, in user and workspace settings.
 */
export function removeLegacyAssociations(context: vscode.ExtensionContext): void {
  void cleanAssociations();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('workbench.editorAssociations')) {
        void cleanAssociations();
      }
    }),
  );
}

async function cleanAssociations(): Promise<void> {
  for (const { target, value } of SCOPES) {
    if (target === vscode.ConfigurationTarget.Workspace && !vscode.workspace.workspaceFolders) {
      continue;
    }
    const workbench = vscode.workspace.getConfiguration('workbench');
    const current = workbench.inspect<Record<string, string>>('editorAssociations')?.[value];
    const next = withoutDotenvAssociations(current, DOTENV_VIEW_TYPE, configuredEnvFiles());
    if (next) {
      try {
        await workbench.update('editorAssociations', Object.keys(next).length > 0 ? next : undefined, target);
      } catch (error) {
        console.error('Dotenv Manager: could not remove .env editor associations', error);
      }
    }
  }
}
