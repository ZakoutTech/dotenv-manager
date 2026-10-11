import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { EditIntent } from '../../src/shared/protocol';

async function waitFor<T>(read: () => T, done: (value: T) => boolean, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = read();
  while (!done(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    value = read();
  }
  return value;
}

const ORIGINAL ='# === Database ===\n# Connection settings\n\n# Hostname\nDB_HOST=localhost\nDB_PORT=5432\n';

suite('Dotenv Manager editing', () => {
  let dir: string;
  let uri: vscode.Uri;

  setup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotenv-manager-'));
    const file = path.join(dir, '.env');
    fs.writeFileSync(file, ORIGINAL);
    uri = vscode.Uri.file(file);
  });

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const applyEdit = (intent: EditIntent): Thenable<boolean> =>
    vscode.commands.executeCommand<boolean>('dotenvManager.applyEdit', uri, intent);

  test('an intent rewrites the document text', async () => {
    const doc = await vscode.workspace.openTextDocument(uri);
    assert.strictEqual(await applyEdit({ type: 'addVariable', group: 1, key: 'DB_USER', value: 'admin' }), true);
    assert.strictEqual(doc.getText(), ORIGINAL + 'DB_USER=admin\n');
  });

  test('each intent is exactly one undo step', async () => {
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    await applyEdit({ type: 'moveVariable', ref: { group: 1, index: 0 }, toGroup: 1, toIndex: 1 });
    await applyEdit({ type: 'updateVariable', ref: { group: 1, index: 0 }, changes: { value: '6543' } });
    assert.strictEqual(doc.getText(), '# === Database ===\n# Connection settings\n\nDB_PORT=6543\n# Hostname\nDB_HOST=localhost\n');

    await vscode.commands.executeCommand('undo');
    assert.strictEqual(doc.getText(), '# === Database ===\n# Connection settings\n\nDB_PORT=5432\n# Hostname\nDB_HOST=localhost\n');
    await vscode.commands.executeCommand('undo');
    assert.strictEqual(doc.getText(), ORIGINAL);
  });

  test('edits apply while the document is open in the Dotenv Manager editor', async () => {
    await vscode.commands.executeCommand('vscode.openWith', uri, 'dotenvManager.editor');
    await applyEdit({ type: 'renameGroup', group: 1, name: 'DB' });
    const doc = await vscode.workspace.openTextDocument(uri);
    assert.ok(doc.getText().startsWith('# === DB ===\n'));
    assert.strictEqual(doc.isDirty, true);
  });

  test('"Sort All Groups" works from the text editor as one undo step', async () => {
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand('dotenvManager.sortAll');
    assert.strictEqual(doc.getText(), '# === Database ===\n# Connection settings\n\n# Hostname\nDB_HOST=localhost\nDB_PORT=5432\n');

    await applyEdit({ type: 'addVariable', group: 1, key: 'API', value: '1', index: 0 });
    await vscode.commands.executeCommand('dotenvManager.sortAll');
    assert.strictEqual(
      doc.getText(),
      '# === Database ===\n# Connection settings\n\nAPI=1\n# Hostname\nDB_HOST=localhost\nDB_PORT=5432\n',
    );
    await vscode.commands.executeCommand('workbench.action.files.save');

    await applyEdit({ type: 'moveVariable', ref: { group: 1, index: 0 }, toGroup: 1, toIndex: 2 });
    await vscode.commands.executeCommand('dotenvManager.sortAll');
    assert.ok(doc.getText().includes('\nAPI=1\n# Hostname\nDB_HOST'));
    await vscode.commands.executeCommand('undo');
    assert.ok(doc.getText().endsWith('DB_PORT=5432\nAPI=1\n'));
  });

  test('undefined references appear in the Problems panel and clear when fixed', async () => {
    await vscode.extensions.getExtension('zakout.dotenv-manager')?.activate();
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    await applyEdit({ type: 'addVariable', group: 1, key: 'DB_URL', value: 'pg://${DB_HOST}:${DB_PROT}' });

    const diagnostics = await waitFor(() => vscode.languages.getDiagnostics(uri), (d) => d.length > 0);
    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].message, 'Undefined variable DB_PROT');
    assert.strictEqual(diagnostics[0].range.start.line, 6);
    assert.strictEqual(doc.getText(diagnostics[0].range), '${DB_PROT}');

    await applyEdit({ type: 'updateVariable', ref: { group: 1, index: 2 }, changes: { value: 'pg://${DB_HOST}:${DB_PORT}' } });
    assert.deepStrictEqual(await waitFor(() => vscode.languages.getDiagnostics(uri), (d) => d.length === 0), []);
  });

  test('renaming with reference update is one undo step', async () => {
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    await applyEdit({ type: 'addVariable', group: 1, key: 'DB_URL', value: '${DB_HOST}:$DB_PORT' });
    await applyEdit({ type: 'renameVariable', ref: { group: 1, index: 0 }, key: 'PGHOST', updateReferences: true });
    assert.ok(doc.getText().includes('PGHOST=localhost\n'));
    assert.ok(doc.getText().endsWith('DB_URL=${PGHOST}:$DB_PORT\n'));
    await vscode.commands.executeCommand('undo');
    assert.ok(doc.getText().endsWith('DB_URL=${DB_HOST}:$DB_PORT\n'));
    assert.ok(doc.getText().includes('DB_HOST=localhost\n'));
  });

  test('an invalid intent leaves the document unchanged', async () => {
    const doc = await vscode.workspace.openTextDocument(uri);
    assert.strictEqual(await applyEdit({ type: 'addVariable', group: 1, key: '1BAD', value: '' }), false);
    assert.strictEqual(doc.getText(), ORIGINAL);
  });
});
