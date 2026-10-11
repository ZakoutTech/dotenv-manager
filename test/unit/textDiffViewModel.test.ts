import { describe, expect, it } from 'vitest';
import { minimalReplace } from '../../src/core/textDiff';
import { toViewDocument } from '../../src/core/viewModel';
import { parse } from '../../src/core/parse';

const apply = (oldText: string, newText: string): string => {
  const r = minimalReplace(oldText, newText);
  return oldText.slice(0, r.start) + r.text + oldText.slice(r.end);
};

describe('minimalReplace', () => {
  it.each([
    ['A=1\nB=2\n', 'A=1\nB=3\n'],
    ['A=1\n', 'X=0\nA=1\n'],
    ['A=1\nB=2\n', 'A=1\n'],
    ['', 'A=1'],
    ['same', 'same'],
    ['aaa', 'aaaa'],
    ['A=1\r\nB=2\r\n', 'A=1\r\nC=2\r\nB=2\r\n'],
    ['x😀y', 'x😁y'],
  ])('reproduces the new text: %j -> %j', (oldText, newText) => {
    expect(apply(oldText, newText)).toBe(newText);
  });

  it('replaces only the changed span', () => {
    expect(minimalReplace('A=1\nB=2\nC=3\n', 'A=1\nB=9\nC=3\n')).toEqual({ start: 6, end: 7, text: '9' });
  });

  it('returns an empty replacement for identical text', () => {
    expect(minimalReplace('abc', 'abc')).toEqual({ start: 3, end: 3, text: '' });
  });

  it('never splits a CRLF pair or a surrogate pair', () => {
    const crlf = minimalReplace('A\r\nB', 'A\nB');
    expect(crlf.start).toBeLessThanOrEqual(1);
    const emoji = minimalReplace('😀', '😁');
    expect(emoji).toEqual({ start: 0, end: 2, text: '😁' });
  });
});

describe('toViewDocument', () => {
  it('maps groups and entries to plain comment text', () => {
    const doc = parse('# top note\n\nA=1 # inline\n\n# === G ===\n# group\n\n# about B\nexport B="x"\n');
    expect(toViewDocument(doc)).toEqual({
      groups: [
        {
          name: null,
          comment: '',
          entries: [{ key: 'A', value: '1', quote: '', exported: false, comment: '', inlineComment: 'inline' }],
        },
        {
          name: 'G',
          comment: 'group',
          entries: [{ key: 'B', value: 'x', quote: '"', exported: true, comment: 'about B' }],
        },
      ],
    });
  });
});

describe('toViewDocument references', () => {
  it('adds resolved values and warnings only for values with references', () => {
    const [x, y, z] = toViewDocument(parse('X=123\nY=${X}\nZ=${NOPE}\n')).groups[0].entries;
    expect(x).not.toHaveProperty('resolved');
    expect(y).toMatchObject({ references: ['X'], resolved: '123' });
    expect(z).toMatchObject({ references: ['NOPE'], resolved: '', warnings: ['Undefined variable NOPE'] });
  });
});
