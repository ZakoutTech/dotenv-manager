import { describe, expect, it } from 'vitest';
import { applyIntent, EditError } from '../../src/core/edits';
import { countVariables } from '../../src/core/envFileList';
import type { EnvEntry } from '../../src/core/model';
import { parse } from '../../src/core/parse';
import { resolve } from '../../src/core/resolve';
import { serialize } from '../../src/core/serialize';
import { toViewDocument } from '../../src/core/viewModel';
import { computeProblems } from '../../src/core/diagnostics';

const entries = (text: string): EnvEntry[] =>
  parse(text).groups.flatMap((g) => g.items.filter((i): i is EnvEntry => i.type === 'entry'));

describe('commented-out variables', () => {
  const SOURCE = [
    '# Old database',
    '# DB_HOST=old.example.com',
    'DB_HOST=localhost',
    '#export TOKEN="a b" # rotated',
    '# Note = this is prose',
    '# see https://example.com/?a=b',
    '',
  ].join('\n');

  it('parses `# KEY=value` lines as disabled variables with their comment', () => {
    const [old, active, token] = entries(SOURCE);
    expect(old).toMatchObject({ key: 'DB_HOST', value: 'old.example.com', disabled: true, comment: ['# Old database'], line: 1 });
    expect(active.disabled).toBeUndefined();
    expect(token).toMatchObject({ key: 'TOKEN', value: 'a b', quote: '"', exported: true, inlineComment: 'rotated', disabled: true });
    expect(entries(SOURCE)).toHaveLength(3);
  });

  it('round-trips the file unchanged', () => {
    expect(serialize(parse(SOURCE))).toBe(SOURCE);
  });

  it('keeps headers, prose and unterminated quotes as comments', () => {
    expect(entries('# === DB ===\n# Note = x\n# A="open\n')).toHaveLength(0);
    expect(parse('# === DB ===\n# Settings\n').groups[1].comment).toEqual(['# Settings']);
  });

  it('a commented variable right below a header is a variable, not the group comment', () => {
    const doc = parse('# === DB ===\n# DB_URL=x\n');
    expect(doc.groups[1].comment).toEqual([]);
    expect(doc.groups[1].items[0]).toMatchObject({ key: 'DB_URL', disabled: true });
  });

  it('is ignored by resolution, diagnostics and the variable count', () => {
    const text = '# A=1\nB=${A}\n# C=${MISSING}\n';
    expect(resolve(parse(text)).get('B')?.value).toBe('');
    expect(resolve(parse(text)).has('C')).toBe(false);
    expect(computeProblems(text).map((p) => p.message)).toEqual(['Undefined variable A']);
    expect(countVariables(text)).toBe(1);
  });

  it('is marked in the view model without resolution data', () => {
    const view = toViewDocument(parse('# A=${B}\nB=1\n'));
    expect(view.groups[0].entries[0]).toEqual({ key: 'A', value: '${B}', quote: '', exported: false, comment: '', disabled: true });
  });

  it('comments a variable out and back in as a minimal change', () => {
    const doc = parse('# Host\nHOST=localhost # local\nPORT=1\n');
    const off = applyIntent(doc, { type: 'updateVariable', ref: { group: 0, index: 0 }, changes: { disabled: true } });
    expect(serialize(off)).toBe('# Host\n# HOST=localhost # local\nPORT=1\n');
    const on = applyIntent(parse(serialize(off)), { type: 'updateVariable', ref: { group: 0, index: 0 }, changes: { disabled: false } });
    expect(serialize(on)).toBe('# Host\nHOST=localhost # local\nPORT=1\n');
  });

  it('can be edited while commented out', () => {
    const next = applyIntent(parse('# A=1\n'), { type: 'updateVariable', ref: { group: 0, index: 0 }, changes: { value: 'x y' } });
    expect(serialize(next)).toBe('# A="x y"\n');
  });

  it('refuses to comment out a multiline value', () => {
    const doc = parse('A="line1\nline2"\n');
    expect(() => applyIntent(doc, { type: 'updateVariable', ref: { group: 0, index: 0 }, changes: { disabled: true } })).toThrow(EditError);
  });
});
