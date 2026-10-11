import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'zakout.dotenv-manager';
const VIEW_TYPE = 'dotenvManager.editor';

function fixtureUri(name: string): vscode.Uri {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  assert.ok(root, 'tests must run with the fixtures workspace open');
  return vscode.Uri.file(path.join(root, name));
}

function activeTabViewType(): string | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  return input instanceof vscode.TabInputCustom ? input.viewType : undefined;
}

/** Opening a custom editor activates the extension first, so the tab can appear a tick later. */
async function waitForActiveViewType(expected: string, timeoutMs = 5000): Promise<string | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (activeTabViewType() !== expected && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return activeTabViewType();
}

suite('Dotenv Manager extension', () => {
  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('contributes the custom editor with "option" priority', () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, 'extension should be installed');
    const editors = ext.packageJSON.contributes.customEditors as Array<{ viewType: string; priority: string }>;
    const editor = editors.find((e) => e.viewType === VIEW_TYPE);
    assert.ok(editor, 'custom editor should be contributed');
    assert.strictEqual(editor.priority, 'option');
  });

  test('shows an icon button in the editor title bar for .env files', () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext);
    const { commands, menus } = ext.packageJSON.contributes;
    const open = commands.find((c: { command: string }) => c.command === 'dotenvManager.openEditor');
    for (const file of [open.icon.light, open.icon.dark, ext.packageJSON.icon]) {
      assert.ok(fs.existsSync(path.join(ext.extensionPath, file)), `${file} should exist`);
    }
    const titleItem = menus['editor/title'].find((m: { command: string }) => m.command === 'dotenvManager.openEditor');
    assert.strictEqual(titleItem.group, 'navigation');
  });

  test('opens a .env file in the Dotenv Manager editor via vscode.openWith', async () => {
    await vscode.commands.executeCommand('vscode.openWith', fixtureUri('sample.env'), VIEW_TYPE);
    assert.strictEqual(await waitForActiveViewType(VIEW_TYPE), VIEW_TYPE);
  });

  test('"Open with Dotenv Manager" reopens the active text editor', async () => {
    const doc = await vscode.workspace.openTextDocument(fixtureUri('sample.env'));
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand('dotenvManager.openEditor');
    assert.strictEqual(await waitForActiveViewType(VIEW_TYPE), VIEW_TYPE);
  });
});
