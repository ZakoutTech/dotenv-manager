import * as vscode from 'vscode';
import { DOTENV_VIEW_TYPE, nextAssociations, type DefaultView } from '../shared/associations';

const SECTION = 'dotenvManager';
const KEY = 'defaultView';

export function getDefaultView(): DefaultView {
  return vscode.workspace.getConfiguration(SECTION).get<DefaultView>(KEY, 'visual') === 'text' ? 'text' : 'visual';
}

/** Write where the user configured the option: the workspace if set there, otherwise user settings. */
function settingsTarget(): vscode.ConfigurationTarget {
  const inspected = vscode.workspace.getConfiguration(SECTION).inspect(KEY);
  return inspected?.workspaceValue !== undefined ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
}

export async function setDefaultView(view: DefaultView): Promise<void> {
  await vscode.workspace.getConfiguration(SECTION).update(KEY, view, settingsTarget());
  // The configuration listener also applies this; awaiting here makes callers see the result.
  await applyDefaultView();
}

/** Make `workbench.editorAssociations` match `dotenvManager.defaultView`. */
export async function applyDefaultView(): Promise<void> {
  const target = settingsTarget();
  const workbench = vscode.workspace.getConfiguration('workbench');
  const inspected = workbench.inspect<Record<string, string>>('editorAssociations');
  const current = target === vscode.ConfigurationTarget.Workspace ? inspected?.workspaceValue : inspected?.globalValue;
  const next = nextAssociations(current, getDefaultView(), DOTENV_VIEW_TYPE);
  if (next) {
    await workbench.update('editorAssociations', next, target);
  }
}

export async function chooseDefaultView(): Promise<void> {
  const current = getDefaultView();
  const choices: Array<{ view: DefaultView; label: string; detail: string }> = [
    { view: 'visual', label: 'Dotenv Manager', detail: 'Open .env files in the visual editor' },
    { view: 'text', label: 'Text Editor', detail: 'Open .env files as plain text' },
  ];
  const items = choices.map((item) => ({ ...item, description: item.view === current ? 'current' : undefined }));
  const picked = await vscode.window.showQuickPick(items, { title: 'Open .env files with' });
  if (picked && picked.view !== current) {
    await setDefaultView(picked.view);
  }
}

export function registerDefaultView(context: vscode.ExtensionContext): void {
  void applyDefaultView();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(`${SECTION}.${KEY}`)) {
        void applyDefaultView();
      }
    }),
    vscode.commands.registerCommand('dotenvManager.chooseDefaultView', chooseDefaultView),
  );
}
