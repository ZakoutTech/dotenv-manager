import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { DotenvManagerApi } from '../../src/extension';

async function api(): Promise<DotenvManagerApi> {
  const ext = vscode.extensions.getExtension<DotenvManagerApi>('zakout.dotenv-manager');
  assert.ok(ext);
  const exports = await ext.activate();
  await exports.rescan();
  return exports;
}

async function waitFor<T>(read: () => T, done: (value: T) => boolean, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = read();
  while (!done(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    value = read();
  }
  return value;
}

const relativePaths = (a: DotenvManagerApi): string[] => a.envFiles().map((f) => f.relativePath);
const root = (): string => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

suite('Workspace .env files', () => {
  test('detects .env files recursively, sorted, skipping vendor/build folders', async () => {
    assert.deepStrictEqual(relativePaths(await api()), ['sample.env', 'apps/api/.env.local']);
  });

  test('picks up created and deleted files live', async () => {
    const a = await api();
    const dir = path.join(root(), 'services', 'worker');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, '.env.test');
    try {
      fs.writeFileSync(file, 'A=1\n');
      const added = await waitFor(() => relativePaths(a), (p) => p.includes('services/worker/.env.test'));
      assert.ok(added.includes('services/worker/.env.test'), `got ${added.join(', ')}`);
    } finally {
      fs.rmSync(path.join(root(), 'services'), { recursive: true, force: true });
    }
    const removed = await waitFor(() => relativePaths(a), (p) => !p.includes('services/worker/.env.test'));
    assert.deepStrictEqual(removed, ['sample.env', 'apps/api/.env.local']);
  });

  test('follows a renamed folder', async () => {
    const a = await api();
    const from = path.join(root(), 'svc-old');
    const to = path.join(root(), 'svc-new');
    fs.mkdirSync(from, { recursive: true });
    try {
      fs.writeFileSync(path.join(from, '.env'), 'A=1\n');
      await waitFor(() => relativePaths(a), (p) => p.includes('svc-old/.env'));
      fs.renameSync(from, to);
      const after = await waitFor(
        () => relativePaths(a),
        (p) => p.includes('svc-new/.env') && !p.includes('svc-old/.env'),
      );
      assert.ok(after.includes('svc-new/.env') && !after.includes('svc-old/.env'), `got ${after.join(', ')}`);
    } finally {
      fs.rmSync(from, { recursive: true, force: true });
      fs.rmSync(to, { recursive: true, force: true });
    }
    await waitFor(() => relativePaths(a), (p) => p.length === 2);
  });

  test('the Dotenv Files view lists the files with their folder', async () => {
    const { tree } = await api();
    const nodes = tree.getChildren();
    assert.deepStrictEqual(
      nodes.map((n) => (n.kind === 'file' ? n.relativePath : n.name)),
      ['sample.env', 'apps/api/.env.local'],
    );
    const item = tree.getTreeItem(nodes[1]);
    assert.strictEqual(item.description, 'apps/api');
    assert.strictEqual(item.contextValue, 'dotenvManager.envFile');
    assert.strictEqual(item.command?.command, 'vscode.open');
  });

  test('view item actions open the clicked file', async () => {
    const { tree } = await api();
    const node = tree.getChildren()[1];
    await vscode.commands.executeCommand('dotenvManager.openText', node);
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    assert.ok(input instanceof vscode.TabInputText);
    assert.ok(input.uri.path.endsWith('apps/api/.env.local'));
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('commands run without a file argument never touch non-.env documents', async () => {
    const doc = await vscode.workspace.openTextDocument({ content: 'B=2\nA=1\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand('dotenvManager.sortAll');
    assert.strictEqual(doc.getText(), 'B=2\nA=1\n');
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  });

  test('contributes the status bar setting, selector command and Explorer view', async () => {
    const pkg = vscode.extensions.getExtension('zakout.dotenv-manager')?.packageJSON;
    assert.ok(pkg.activationEvents.includes('onStartupFinished'));
    assert.strictEqual(pkg.contributes.configuration.properties['dotenvManager.statusBar.enabled'].default, true);
    assert.ok(pkg.contributes.views.explorer.some((v: { id: string }) => v.id === 'dotenvManager.files'));
    const commands = await vscode.commands.getCommands(true);
    for (const id of ['dotenvManager.selectEnvFile', 'dotenvManager.refreshEnvFiles']) {
      assert.ok(commands.includes(id), id);
    }
  });
});
