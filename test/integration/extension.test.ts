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

  test('contributes the custom editor as an option (associations make it the default)', () => {
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

  test('offers "Open with Dotenv Manager" in the Explorer and tab context menus for .env files', () => {
    const menus = vscode.extensions.getExtension(EXTENSION_ID)?.packageJSON.contributes.menus;
    for (const menu of ['explorer/context', 'editor/title/context']) {
      const item = menus[menu]?.find((m: { command: string }) => m.command === 'dotenvManager.openEditor');
      assert.ok(item, `${menu} should contain the command`);
      assert.match(item.when, /resourceFilename/);
    }
  });

  test('"Open with Dotenv Manager" opens the file it is invoked on (Explorer context menu)', async () => {
    await vscode.commands.executeCommand('dotenvManager.openEditor', fixtureUri('sample.env'));
    assert.strictEqual(await waitForActiveViewType(VIEW_TYPE), VIEW_TYPE);
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input as vscode.TabInputCustom;
    assert.strictEqual(path.basename(input.uri.fsPath), 'sample.env');
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

async function waitFor<T>(read: () => T, done: (value: T) => boolean, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = read();
  while (!done(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    value = read();
  }
  return value;
}

const isTextTab = (): boolean => vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputText;

suite('Default editor for .env files', () => {
  const associations = (): Record<string, string> =>
    vscode.workspace.getConfiguration('workbench').get<Record<string, string>>('editorAssociations') ?? {};
  const setDefaultView = (view: 'visual' | 'text' | undefined): Thenable<void> =>
    vscode.workspace.getConfiguration('dotenvManager').update('defaultView', view, vscode.ConfigurationTarget.Global);

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await setDefaultView(undefined);
    await vscode.workspace.getConfiguration('workbench').update('editorAssociations', undefined, vscode.ConfigurationTarget.Global);
  });

  test('opens .env files in Dotenv Manager by default', async () => {
    await vscode.commands.executeCommand('vscode.open', fixtureUri('sample.env'));
    assert.strictEqual(await waitForActiveViewType(VIEW_TYPE), VIEW_TYPE);
  });

  test('the defaultView setting switches the default editor via editorAssociations', async () => {
    await setDefaultView('text');
    await waitFor(associations, (a) => a['.env'] === 'default');
    assert.deepStrictEqual(
      ['.env', '.env.local', '.env.test', 'sample.env'].map((p) => associations()[p]),
      ['default', 'default', 'default', 'default'],
    );
    await vscode.commands.executeCommand('vscode.open', fixtureUri('sample.env'));
    assert.ok(await waitFor(isTextTab, (text) => text), 'should open as text');

    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await setDefaultView('visual');
    await waitFor(associations, (a) => a['.env'] === VIEW_TYPE);
    await vscode.commands.executeCommand('vscode.open', fixtureUri('sample.env'));
    assert.strictEqual(await waitForActiveViewType(VIEW_TYPE), VIEW_TYPE);
  });

  test('only names in dotenvManager.envFiles open in Dotenv Manager; .env.ts keeps its own editor', async () => {
    const file = fixtureUri('.env.ts');
    fs.writeFileSync(file.fsPath, 'export const x = 1;\n');
    try {
      await waitFor(associations, (a) => a['sample.env'] === VIEW_TYPE);
      assert.strictEqual(associations()['.env.*'], undefined);
      await vscode.commands.executeCommand('vscode.open', file);
      assert.ok(await waitFor(isTextTab, (text) => text), '.env.ts should open as text');
      assert.strictEqual(activeTabViewType(), undefined);
    } finally {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      fs.rmSync(file.fsPath, { force: true });
    }
  });

  test('adding a name to dotenvManager.envFiles makes it open in Dotenv Manager', async () => {
    const config = vscode.workspace.getConfiguration('dotenvManager');
    const file = fixtureUri('.env.staging');
    fs.writeFileSync(file.fsPath, 'A=1\n');
    const listed = config.inspect<string[]>('envFiles')?.workspaceValue ?? [];
    try {
      await vscode.commands.executeCommand('vscode.open', file);
      assert.ok(await waitFor(isTextTab, (text) => text), 'unlisted names open as text');
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');

      await config.update('envFiles', [...listed, '.env.staging'], vscode.ConfigurationTarget.Workspace);
      await waitFor(associations, (a) => a['.env.staging'] === VIEW_TYPE);
      await vscode.commands.executeCommand('vscode.open', file);
      assert.strictEqual(await waitForActiveViewType(VIEW_TYPE), VIEW_TYPE);
    } finally {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      await config.update('envFiles', listed, vscode.ConfigurationTarget.Workspace);
      fs.rmSync(file.fsPath, { force: true });
    }
    assert.strictEqual(await waitFor(() => associations()['.env.staging'], (v) => v === undefined), undefined);
  });

  test('"Open as Text" replaces the Dotenv Manager tab', async () => {
    await vscode.commands.executeCommand('vscode.openWith', fixtureUri('sample.env'), VIEW_TYPE);
    await waitForActiveViewType(VIEW_TYPE);
    await vscode.commands.executeCommand('dotenvManager.openText');
    assert.ok(await waitFor(isTextTab, (text) => text));
    assert.strictEqual(vscode.window.tabGroups.activeTabGroup.tabs.length, 1);
  });

  test('"Open with Dotenv Manager" replaces the text tab', async () => {
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(fixtureUri('sample.env')));
    await vscode.commands.executeCommand('dotenvManager.openEditor');
    assert.strictEqual(await waitForActiveViewType(VIEW_TYPE), VIEW_TYPE);
    assert.strictEqual(vscode.window.tabGroups.activeTabGroup.tabs.length, 1);
  });

  test('switching editors never discards unsaved edits (the text tab stays open)', async () => {
    const doc = await vscode.workspace.openTextDocument(fixtureUri('sample.env'));
    await vscode.window.showTextDocument(doc);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(doc.uri, new vscode.Position(doc.lineCount, 0), 'UNSAVED=1\n');
    await vscode.workspace.applyEdit(edit);

    await vscode.commands.executeCommand('dotenvManager.openEditor');
    assert.strictEqual(await waitForActiveViewType(VIEW_TYPE), VIEW_TYPE);
    assert.strictEqual(vscode.window.tabGroups.activeTabGroup.tabs.length, 2);
    assert.ok(doc.isDirty);
    assert.ok(doc.getText().includes('UNSAVED=1'));
  });
});
