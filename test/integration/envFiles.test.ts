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
    await vscode.commands.executeCommand(item.command.command, ...(item.command.arguments ?? []));
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    assert.ok(input instanceof vscode.TabInputText && input.uri.path.endsWith('apps/api/.env.local'), 'opens as text');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
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

  test('creates a .env file (with folders) and opens it', async () => {
    const a = await api();
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    assert.ok(folder);
    try {
      const created = await vscode.commands.executeCommand<vscode.Uri | undefined>(
        'dotenvManager.createEnvFile',
        folder,
        'new-app/config/.env.local',
      );
      assert.ok(created && fs.existsSync(created.fsPath));
      assert.strictEqual(fs.readFileSync(created.fsPath, 'utf8'), '');
      const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
      assert.ok(
        (input instanceof vscode.TabInputCustom || input instanceof vscode.TabInputText) && input.uri.fsPath === created.fsPath,
      );
      const listed = await waitFor(() => relativePaths(a), (p) => p.includes('new-app/config/.env.local'));
      assert.ok(listed.includes('new-app/config/.env.local'), `got ${listed.join(', ')}`);
    } finally {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      fs.rmSync(path.join(root(), 'new-app'), { recursive: true, force: true });
    }
    await waitFor(() => relativePaths(a), (p) => p.length === 2);
  });

  test('never overwrites an existing file and rejects invalid names', async () => {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    const before = fs.readFileSync(path.join(root(), 'sample.env'), 'utf8');
    assert.strictEqual(await vscode.commands.executeCommand('dotenvManager.createEnvFile', folder, 'sample.env'), undefined);
    assert.strictEqual(await vscode.commands.executeCommand('dotenvManager.createEnvFile', folder, '../escape/.env'), undefined);
    assert.strictEqual(await vscode.commands.executeCommand('dotenvManager.createEnvFile', folder, 'notes.txt'), undefined);
    assert.strictEqual(fs.readFileSync(path.join(root(), 'sample.env'), 'utf8'), before);
    assert.ok(!fs.existsSync(path.join(root(), '..', 'escape')));
    assert.ok(!fs.existsSync(path.join(root(), 'notes.txt')));
  });

  test('dotenvManager.exclude replaces the default excludes', async () => {
    const a = await api();
    const config = vscode.workspace.getConfiguration('dotenvManager');
    try {
      await config.update('exclude', ['apps'], vscode.ConfigurationTarget.Global);
      const changed = await waitFor(
        () => relativePaths(a),
        (p) => p.join() === ['sample.env', 'vendor/lib/.env'].join(),
      );
      assert.deepStrictEqual(changed, ['sample.env', 'vendor/lib/.env']);
    } finally {
      await config.update('exclude', undefined, vscode.ConfigurationTarget.Global);
    }
    assert.deepStrictEqual(
      await waitFor(() => relativePaths(a), (p) => p.join() === ['sample.env', 'apps/api/.env.local'].join()),
      ['sample.env', 'apps/api/.env.local'],
    );
  });

  test('detects only the names listed in dotenvManager.envFiles', async () => {
    const a = await api();
    const config = vscode.workspace.getConfiguration('dotenvManager');
    const listed = config.inspect<string[]>('envFiles')?.workspaceValue ?? [];
    const ts = path.join(root(), '.env.ts');
    fs.writeFileSync(ts, 'export {};\n');
    try {
      await a.rescan();
      assert.deepStrictEqual(relativePaths(a), ['sample.env', 'apps/api/.env.local']);
      await config.update('envFiles', ['.env.local'], vscode.ConfigurationTarget.Workspace);
      assert.deepStrictEqual(
        await waitFor(() => relativePaths(a), (p) => p.join() === 'apps/api/.env.local'),
        ['apps/api/.env.local'],
      );
    } finally {
      fs.rmSync(ts, { force: true });
      await config.update('envFiles', listed, vscode.ConfigurationTarget.Workspace);
    }
    assert.deepStrictEqual(
      await waitFor(() => relativePaths(a), (p) => p.length === 2),
      ['sample.env', 'apps/api/.env.local'],
    );
  });

  test('contributes the status bar setting, selector command and Explorer view', async () => {
    const pkg = vscode.extensions.getExtension('zakout.dotenv-manager')?.packageJSON;
    assert.ok(pkg.activationEvents.includes('onStartupFinished'));
    assert.strictEqual(pkg.contributes.configuration.properties['dotenvManager.statusBar.enabled'].default, true);
    assert.ok(pkg.contributes.views.explorer.some((v: { id: string }) => v.id === 'dotenvManager.files'));
    const commands = await vscode.commands.getCommands(true);
    for (const id of ['dotenvManager.selectEnvFile', 'dotenvManager.refreshEnvFiles', 'dotenvManager.createEnvFile']) {
      assert.ok(commands.includes(id), id);
    }
  });
});
