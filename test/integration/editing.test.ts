import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { EditIntent } from '../../src/shared/protocol';

const ORIGINAL = '# === Database ===\n# Connection settings\n\n# Hostname\nDB_HOST=localhost\nDB_PORT=5432\n';

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

  test('an invalid intent leaves the document unchanged', async () => {
    const doc = await vscode.workspace.openTextDocument(uri);
    assert.strictEqual(await applyEdit({ type: 'addVariable', group: 1, key: '1BAD', value: '' }), false);
    assert.strictEqual(doc.getText(), ORIGINAL);
  });
});
