import { describe, expect, it } from 'vitest';
import { parse } from '../../src/core/parse';
import { findReferences, resolve, resolveEntries } from '../../src/core/resolve';

const resolved = (text: string): Record<string, string> => Object.fromEntries([...resolve(parse(text))].map(([key, r]) => [key, r.value]));

describe('resolve', () => {
  it('expands ${VAR} references (the plan example)', () => {
    expect(resolved('VARIABLE_X=123\nVARIABLE_Y=${VARIABLE_X}\n')).toEqual({
      VARIABLE_X: '123',
      VARIABLE_Y: '123',
    });
  });

  it('expands bare $VAR references', () => {
    expect(resolved('A=x\nB=$A-$A/y\n').B).toBe('x-x/y');
  });

  it('resolves chains regardless of declaration order', () => {
    expect(resolved('C=${B}!\nB=${A}${A}\nA=ab\n')).toEqual({ A: 'ab', B: 'abab', C: 'abab!' });
  });

  it('supports defaults with :- (unset or empty) and - (unset only)', () => {
    const r = resolved('EMPTY=\nA=${MISSING:-d1}\nB=${EMPTY:-d2}\nC=${MISSING-d3}\nD=${EMPTY-d4}\n');
    expect(r).toMatchObject({ A: 'd1', B: 'd2', C: 'd3', D: '' });
  });

  it('expands references inside defaults, including nested braces', () => {
    expect(resolved('X=1\nA=${MISSING:-${X}}\nB=${MISSING:-pre-$X}\n')).toMatchObject({ A: '1', B: 'pre-1' });
  });

  it('does not expand single-quoted values', () => {
    expect(resolved("A=1\nB='${A}'\n").B).toBe('${A}');
  });

  it('expands double-quoted and backtick values', () => {
    expect(resolved('A=1\nB="v${A}"\nC=`v${A}`\n')).toMatchObject({ B: 'v1', C: 'v1' });
  });

  it('turns \\$ into a literal $ and does not expand it', () => {
    expect(resolved('A=1\nB=\\${A}\nC="cost \\$5"\n')).toMatchObject({ B: '${A}', C: 'cost $5' });
  });

  it('keeps a lone $ that is not followed by a name', () => {
    expect(resolved('A=$ 5\nB=100$\n')).toMatchObject({ A: '$ 5', B: '100$' });
  });

  it('uses the last definition of a duplicate key', () => {
    expect(resolved('A=1\nA=2\nB=${A}\n').B).toBe('2');
  });

  it('reports undefined references and expands them to empty', () => {
    const res = resolve(parse('A=x${NOPE}y\n')).get('A');
    expect(res?.value).toBe('xy');
    expect(res?.diagnostics).toEqual([{ kind: 'undefined', key: 'A', ref: 'NOPE', message: 'Undefined variable NOPE' }]);
  });

  it('does not report an undefined reference that has a default', () => {
    expect(resolve(parse('A=${NOPE:-d}\n')).get('A')?.diagnostics).toEqual([]);
  });

  it('reports a cycle diagnostic for every key in the cycle, without throwing', () => {
    const res = resolve(parse('A=${B}\nB=${A}\nC=${A}\n'));
    expect(res.get('A')?.diagnostics.map((d) => d.kind)).toEqual(['cycle']);
    expect(res.get('B')?.diagnostics.map((d) => d.kind)).toEqual(['cycle']);
    expect(res.get('C')?.diagnostics).toEqual([]);
  });

  it('reports a self-reference as a cycle', () => {
    const a = resolve(parse('A=x${A}\n')).get('A');
    expect(a?.diagnostics).toEqual([{ kind: 'cycle', key: 'A', ref: 'A', message: 'Reference cycle: A → A' }]);
  });

  it('lists the direct references of each value', () => {
    expect(resolve(parse('A=1\nB=${A}$C${D:-${E}}\n')).get('B')?.references).toEqual(['A', 'C', 'D', 'E']);
  });

  it('treats an unterminated ${ as literal text', () => {
    expect(resolved('A=1\nB=${A\n').B).toBe('${A');
  });

  it('treats malformed braces as literal text', () => {
    expect(resolved('A=1\nB=${}\nC=${A!}\nD=${A:-x\n')).toMatchObject({ B: '${}', C: '${A!}', D: '${A:-x' });
  });

  it('keeps escaped characters inside defaults', () => {
    expect(resolved('A=${MISSING:-a\\}b}\n').A).toBe('a\\}b');
  });
});

describe('findReferences', () => {
  it('returns names and offsets of references in a raw value', () => {
    expect(findReferences('a${X}b$Y\\$Z${W:-${V}}')).toEqual([
      { name: 'X', start: 1, end: 5 },
      { name: 'Y', start: 6, end: 8 },
      { name: 'W', start: 11, end: 21 },
      { name: 'V', start: 16, end: 20 },
    ]);
  });
});

describe('resolveEntries', () => {
  it('resolves earlier duplicate definitions with their own value', () => {
    const doc = parse('X=1\nA=${X}a\nA=${X}b\n');
    const values = [...resolveEntries(doc).entries()].map(([entry, r]) => [entry.key, r.value]);
    expect(values).toEqual([
      ['X', '1'],
      ['A', '1a'],
      ['A', '1b'],
    ]);
  });
});
