import { describe, expect, it } from 'vitest';
import { applyIntent, EditError } from '../../src/core/edits';
import { parse } from '../../src/core/parse';
import { serialize } from '../../src/core/serialize';
import type { EditIntent } from '../../src/shared/protocol';

const edit = (text: string, ...intents: EditIntent[]): string =>
  serialize(intents.reduce((doc, intent) => applyIntent(doc, intent), parse(text)));

const SAMPLE = [
  'TOP=1',
  '',
  '# === Database ===',
  '# Connection settings',
  '',
  '# Hostname',
  'DB_HOST=localhost',
  'DB_PORT=5432',
  '',
  '# === API ===',
  'API_KEY="abc 123"',
  '',
].join('\n');

describe('applyIntent', () => {
  it('does not mutate the input document', () => {
    const doc = parse(SAMPLE);
    applyIntent(doc, { type: 'deleteVariable', ref: { group: 1, index: 0 } });
    expect(serialize(doc)).toBe(SAMPLE);
  });

  describe('addVariable', () => {
    it('appends after the last variable of the group, before trailing blanks', () => {
      expect(edit(SAMPLE, { type: 'addVariable', group: 1, key: 'DB_USER', value: 'admin', comment: 'Login' })).toBe(
        SAMPLE.replace('DB_PORT=5432\n', 'DB_PORT=5432\n# Login\nDB_USER=admin\n'),
      );
    });

    it('inserts at a given index', () => {
      expect(edit(SAMPLE, { type: 'addVariable', group: 1, key: 'X', value: 'has space', index: 0 })).toBe(
        SAMPLE.replace('# Hostname\n', 'X="has space"\n# Hostname\n'),
      );
    });

    it('adds to an empty file', () => {
      expect(edit('', { type: 'addVariable', group: 0, key: 'A', value: '1' })).toBe('A=1');
    });

    it('separates a commented first variable from the group comment with a blank line', () => {
      const text = '# === G ===\n# group note\n';
      expect(edit(text, { type: 'addVariable', group: 1, key: 'A', value: '1', comment: 'about A' })).toBe(
        '# === G ===\n# group note\n\n# about A\nA=1\n',
      );
    });

    it('separates a new variable from a preceding free comment block', () => {
      expect(edit('# free note\n', { type: 'addVariable', group: 0, key: 'A', value: '1' })).toBe('# free note\n\nA=1\n');
    });

    it.each(['', '1A', 'A B', 'A=B', 'A$'])('rejects invalid key %j', (key) => {
      expect(() => edit(SAMPLE, { type: 'addVariable', group: 0, key, value: '' })).toThrow(EditError);
    });

    it('rejects an unknown group', () => {
      expect(() => edit(SAMPLE, { type: 'addVariable', group: 9, key: 'A', value: '' })).toThrow(EditError);
    });
  });

  describe('updateVariable', () => {
    it('re-formats the line when the value changes', () => {
      expect(edit(SAMPLE, { type: 'updateVariable', ref: { group: 1, index: 1 }, changes: { value: '6543' } })).toBe(
        SAMPLE.replace('DB_PORT=5432', 'DB_PORT=6543'),
      );
    });

    it('keeps the raw line when only the comment changes', () => {
      const text = 'export   A = "x"  # inline\n';
      expect(edit(text, { type: 'updateVariable', ref: { group: 0, index: 0 }, changes: { comment: 'note\nmore' } })).toBe(
        '# note\n# more\nexport   A = "x"  # inline\n',
      );
    });

    it('removes the comment with an empty string', () => {
      expect(edit(SAMPLE, { type: 'updateVariable', ref: { group: 1, index: 0 }, changes: { comment: '' } })).toBe(
        SAMPLE.replace('# Hostname\n', ''),
      );
    });

    it('updates key, quote, export flag and inline comment', () => {
      const changes = { key: 'B', quote: "'" as const, exported: true, inlineComment: 'hi' };
      expect(edit('A=1\n', { type: 'updateVariable', ref: { group: 0, index: 0 }, changes })).toBe("export B='1' # hi\n");
      expect(
        edit('A=1 # x\n', { type: 'updateVariable', ref: { group: 0, index: 0 }, changes: { inlineComment: null } }),
      ).toBe('A=1\n');
    });

    it('rejects an unknown variable', () => {
      expect(() => edit(SAMPLE, { type: 'updateVariable', ref: { group: 1, index: 5 }, changes: {} })).toThrow(EditError);
    });
  });

  describe('deleteVariable', () => {
    it('removes the variable together with its comment', () => {
      expect(edit(SAMPLE, { type: 'deleteVariable', ref: { group: 1, index: 0 } })).toBe(
        SAMPLE.replace('# Hostname\nDB_HOST=localhost\n', ''),
      );
    });

    it('collapses the blank line left between two blanks', () => {
      expect(edit('A=1\n\nB=2\n\nC=3\n', { type: 'deleteVariable', ref: { group: 0, index: 1 } })).toBe('A=1\n\nC=3\n');
    });
  });

  describe('moveVariable', () => {
    it('reorders within a group, carrying the comment', () => {
      expect(edit(SAMPLE, { type: 'moveVariable', ref: { group: 1, index: 0 }, toGroup: 1, toIndex: 1 })).toBe(
        SAMPLE.replace('# Hostname\nDB_HOST=localhost\nDB_PORT=5432\n', 'DB_PORT=5432\n# Hostname\nDB_HOST=localhost\n'),
      );
    });

    it('moves to another group, placing it under the target header', () => {
      const out = edit(SAMPLE, { type: 'moveVariable', ref: { group: 2, index: 0 }, toGroup: 1, toIndex: 0 });
      expect(out).toBe(
        SAMPLE.replace('# Hostname\n', 'API_KEY="abc 123"\n# Hostname\n').replace(
          '# === API ===\nAPI_KEY="abc 123"\n',
          '# === API ===\n',
        ),
      );
    });

    it('moves into the implicit group', () => {
      const out = edit(SAMPLE, { type: 'moveVariable', ref: { group: 1, index: 1 }, toGroup: 0, toIndex: 0 });
      expect(out.startsWith('DB_PORT=5432\nTOP=1\n')).toBe(true);
    });

    it('round-trips: the moved variable re-parses into the target group', () => {
      const moved = edit(SAMPLE, { type: 'moveVariable', ref: { group: 1, index: 0 }, toGroup: 2, toIndex: 1 });
      const api = parse(moved).groups[2].items.filter((i) => i.type === 'entry');
      expect(api.map((e) => e.type === 'entry' && [e.key, e.comment])).toEqual([
        ['API_KEY', []],
        ['DB_HOST', ['# Hostname']],
      ]);
    });

    it('rejects an out-of-range target index', () => {
      expect(() => edit(SAMPLE, { type: 'moveVariable', ref: { group: 1, index: 0 }, toGroup: 2, toIndex: 5 })).toThrow(
        EditError,
      );
    });
  });

  describe('groups', () => {
    it('adds a group at the end separated by a blank line', () => {
      expect(edit('A=1', { type: 'addGroup', name: 'Cache', comment: 'Redis' })).toBe('A=1\n\n# === Cache ===\n# Redis');
    });

    it('adds a group to an empty file without a leading blank line', () => {
      expect(edit('', { type: 'addGroup', name: 'Cache' })).toBe('# === Cache ===');
    });

    it('renames a group', () => {
      expect(edit(SAMPLE, { type: 'renameGroup', group: 2, name: 'External API' })).toBe(
        SAMPLE.replace('# === API ===', '# === External API ==='),
      );
    });

    it.each(['', '  ', 'a===b', 'two\nlines'])('rejects invalid group name %j', (name) => {
      expect(() => edit(SAMPLE, { type: 'renameGroup', group: 1, name })).toThrow(EditError);
    });

    it('cannot rename, comment, move or delete the implicit group', () => {
      expect(() => edit(SAMPLE, { type: 'renameGroup', group: 0, name: 'X' })).toThrow(EditError);
      expect(() => edit(SAMPLE, { type: 'updateGroupComment', group: 0, comment: 'x' })).toThrow(EditError);
      expect(() => edit(SAMPLE, { type: 'moveGroup', group: 0, toIndex: 1 })).toThrow(EditError);
      expect(() => edit(SAMPLE, { type: 'deleteGroup', group: 0, deleteVariables: true })).toThrow(EditError);
    });

    it('updates the group comment', () => {
      expect(edit(SAMPLE, { type: 'updateGroupComment', group: 1, comment: 'Primary DB\nPostgres 16' })).toBe(
        SAMPLE.replace('# Connection settings', '# Primary DB\n# Postgres 16'),
      );
      expect(edit(SAMPLE, { type: 'updateGroupComment', group: 1, comment: '' })).toBe(
        SAMPLE.replace('# Connection settings\n', ''),
      );
    });

    it('deletes a group with its variables', () => {
      expect(edit(SAMPLE, { type: 'deleteGroup', group: 2, deleteVariables: true })).toBe(
        SAMPLE.replace('# === API ===\nAPI_KEY="abc 123"\n', ''),
      );
    });

    it('deletes a group but keeps its variables in the previous group', () => {
      const out = edit(SAMPLE, { type: 'deleteGroup', group: 1, deleteVariables: false });
      expect(out).toBe(SAMPLE.replace('# === Database ===\n# Connection settings\n', ''));
      expect(parse(out).groups.map((g) => g.name)).toEqual([null, 'API']);
    });

    it('moves a group and keeps groups separated by blank lines', () => {
      const out = edit(SAMPLE, { type: 'moveGroup', group: 2, toIndex: 1 });
      expect(out).toBe(
        'TOP=1\n\n# === API ===\nAPI_KEY="abc 123"\n\n# === Database ===\n# Connection settings\n\n# Hostname\nDB_HOST=localhost\nDB_PORT=5432\n\n',
      );
      expect(parse(out).groups.map((g) => g.name)).toEqual([null, 'API', 'Database']);
    });

    it('rejects moving a group to the implicit slot', () => {
      expect(() => edit(SAMPLE, { type: 'moveGroup', group: 2, toIndex: 0 })).toThrow(EditError);
    });
  });
});
