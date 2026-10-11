import { describe, expect, it } from 'vitest';
import { parse } from '../../src/core/parse';
import { commentText, formatEntry, serialize, toCommentLines } from '../../src/core/serialize';
import type { EnvEntry, EnvItem } from '../../src/core/model';

const entries = (items: EnvItem[]): EnvEntry[] => items.filter((i): i is EnvEntry => i.type === 'entry');

const corpus: Record<string, string> = {
  empty: '',
  singleNewline: '\n',
  simple: 'A=1\nB=2\n',
  noTrailingNewline: 'A=1\nB=2',
  crlf: '# === G ===\r\n# group note\r\n\r\n# about A\r\nA=1\r\nB="x y"\r\n',
  quotes: `D="double"\nS='single'\nB=\`back\`\nE=""\nU=\n`,
  exportPrefix: 'export A=1\nexport   B="2"\n',
  inlineComments: 'A=1 # one\nB="two" #two\nC=\'3\'   # three\nURL=http://x#frag\n',
  multiline: 'KEY="line1\nline2\nline3"\nNEXT=1\nSQ=\'a\nb\'\n',
  spacing: '  A = 1  \nB= "q"\n\tC=3\n',
  unknownLines: 'A=1\nthis is not valid\n= no key\nUNTERMINATED="oops\nB=2\n',
  groups:
    '# free comment at top\n\nTOP=1\n\n# === Database ===\n# Connection settings\n# second line\n\n# Hostname\nDB_HOST=localhost\nDB_PORT=5432\n\n#=== API===\nAPI_KEY="abc 123"\n',
  bom: '\uFEFFA=1\n',
  blankRuns: '\n\n\nA=1\n\n\n',
  trailingComment: 'A=1\n# dangling\n',
};

describe('round-trip fidelity', () => {
  for (const [name, text] of Object.entries(corpus)) {
    it(`serialize(parse(x)) === x for "${name}"`, () => {
      expect(serialize(parse(text))).toBe(text);
    });
  }
});

describe('parse', () => {
  it('returns a single implicit group for an empty file', () => {
    const doc = parse('');
    expect(doc.groups).toHaveLength(1);
    expect(doc.groups[0].name).toBeNull();
    expect(doc.groups[0].items).toEqual([]);
    expect(doc.finalNewline).toBe(false);
  });

  it('detects CRLF line endings and the BOM', () => {
    expect(parse('A=1\r\n').eol).toBe('\r\n');
    expect(parse('A=1\n').eol).toBe('\n');
    expect(parse('\uFEFFA=1').bom).toBe(true);
  });

  it('splits groups on "# === Name ===" headers', () => {
    const doc = parse(corpus.groups);
    expect(doc.groups.map((g) => g.name)).toEqual([null, 'Database', 'API']);
  });

  it('attaches comment lines directly under a header to the group', () => {
    const db = parse(corpus.groups).groups[1];
    expect(db.comment).toEqual(['# Connection settings', '# second line']);
    expect(commentText(db.comment)).toBe('Connection settings\nsecond line');
  });

  it('attaches contiguous comment lines directly above a variable to it', () => {
    const [host, port] = entries(parse(corpus.groups).groups[1].items);
    expect(host.key).toBe('DB_HOST');
    expect(host.comment).toEqual(['# Hostname']);
    expect(port.comment).toEqual([]);
  });

  it('keeps comments separated by a blank line as free comment blocks', () => {
    const top = parse(corpus.groups).groups[0];
    expect(top.items[0]).toEqual({ type: 'comment', lines: ['# free comment at top'] });
    expect(entries(top.items)[0].comment).toEqual([]);
  });

  it('parses quote styles and values', () => {
    const [d, s, b, e, u] = entries(parse(corpus.quotes).groups[0].items);
    expect([d.value, d.quote]).toEqual(['double', '"']);
    expect([s.value, s.quote]).toEqual(['single', "'"]);
    expect([b.value, b.quote]).toEqual(['back', '`']);
    expect([e.value, e.quote]).toEqual(['', '"']);
    expect([u.value, u.quote]).toEqual(['', '']);
  });

  it('parses the export prefix', () => {
    const [a, b] = entries(parse(corpus.exportPrefix).groups[0].items);
    expect(a.exported).toBe(true);
    expect(b).toMatchObject({ key: 'B', value: '2', exported: true });
  });

  it('parses inline comments (unquoted values stop at #, like dotenv)', () => {
    const [a, b, c, url] = entries(parse(corpus.inlineComments).groups[0].items);
    expect(a).toMatchObject({ value: '1', inlineComment: 'one' });
    expect(b).toMatchObject({ value: 'two', inlineComment: 'two' });
    expect(c).toMatchObject({ value: '3', inlineComment: 'three' });
    expect(url).toMatchObject({ value: 'http://x', inlineComment: 'frag' });
  });

  it('parses multiline quoted values', () => {
    const [key, next, sq] = entries(parse(corpus.multiline).groups[0].items);
    expect(key.value).toBe('line1\nline2\nline3');
    expect(next.key).toBe('NEXT');
    expect(sq.value).toBe('a\nb');
  });

  it('trims whitespace around keys and unquoted values', () => {
    const [a, b, c] = entries(parse(corpus.spacing).groups[0].items);
    expect(a).toMatchObject({ key: 'A', value: '1' });
    expect(b).toMatchObject({ key: 'B', value: 'q', quote: '"' });
    expect(c).toMatchObject({ key: 'C', value: '3' });
  });

  it('preserves unparseable lines as unknown items', () => {
    const items = parse(corpus.unknownLines).groups[0].items;
    expect(items.filter((i) => i.type === 'unknown').map((i) => (i as { raw: string }).raw)).toEqual([
      'this is not valid',
      '= no key',
      'UNTERMINATED="oops',
    ]);
    expect(entries(items).map((e) => e.key)).toEqual(['A', 'B']);
  });

  it('honours backslash-escaped quotes inside quoted values', () => {
    const text = 'A="say \\"hi\\"" # c\n';
    const [a] = entries(parse(text).groups[0].items);
    expect(a).toMatchObject({ value: 'say \\"hi\\"', quote: '"', inlineComment: 'c' });
    expect(serialize(parse(text))).toBe(text);
  });

  it('treats junk after a closing quote like dotenv (unquoted) on a single line', () => {
    const [a] = entries(parse('A="x"y\n').groups[0].items);
    expect(a).toMatchObject({ value: '"x"y', quote: '' });
  });

  it('keeps a multiline value with junk after the closing quote as unknown lines', () => {
    const text = 'A="x\ny"z\nB=1\n';
    const items = parse(text).groups[0].items;
    expect(items[0]).toEqual({ type: 'unknown', raw: 'A="x' });
    expect(serialize(parse(text))).toBe(text);
  });

  it('keeps comments that precede an unknown line as a free comment block', () => {
    const items = parse('# note\n???\n').groups[0].items;
    expect(items[0]).toEqual({ type: 'comment', lines: ['# note'] });
    expect(items[1]).toEqual({ type: 'unknown', raw: '???' });
  });

  it('closes pending comments when a new header starts', () => {
    const doc = parse('# orphan\n# === G ===\nA=1\n');
    expect(doc.groups[0].items).toEqual([{ type: 'comment', lines: ['# orphan'] }]);
    expect(doc.groups[1].name).toBe('G');
  });
});

describe('serialize edited models', () => {
  it('formats entries without raw text from their fields', () => {
    const doc = parse('# === G ===\nA=1\n');
    const a = entries(doc.groups[1].items)[0];
    const edited: EnvEntry = { ...a, raw: undefined, value: 'new value', comment: toCommentLines('About A') };
    doc.groups[1].items = [edited];
    expect(serialize(doc)).toBe('# === G ===\n# About A\nA="new value"\n');
  });

  it('formats a new group header and comment', () => {
    const doc = parse('');
    doc.groups.push({
      name: 'Cache',
      comment: toCommentLines('Redis\n\nsecond paragraph'),
      items: [{ type: 'entry', key: 'REDIS_URL', value: 'redis://x', quote: '', exported: false, comment: [] }],
    });
    doc.finalNewline = true;
    expect(serialize(doc)).toBe('# === Cache ===\n# Redis\n#\n# second paragraph\nREDIS_URL=redis://x\n');
  });

  it('uses the document EOL when joining formatted multiline output', () => {
    const doc = parse('A=1\r\n');
    doc.groups[0].items = [{ type: 'entry', key: 'A', value: 'x\ny', quote: '"', exported: false, comment: [] }];
    expect(serialize(doc)).toBe('A="x\r\ny"\r\n');
  });
});

describe('formatEntry', () => {
  const base: EnvEntry = { type: 'entry', key: 'K', value: 'v', quote: '', exported: false, comment: [] };

  it('writes export prefix, quotes and inline comment', () => {
    expect(formatEntry({ ...base, exported: true, quote: "'", inlineComment: 'note' })).toBe("export K='v' # note");
  });

  it.each([
    ['has spaces', '"has spaces"'],
    [' leading', '" leading"'],
    ['a#b', '"a#b"'],
    ['multi\nline', '"multi\nline"'],
    ['say "hi"', `'say "hi"'`],
    [`it's "x"`, `"it's \\"x\\""`],
  ])('auto-quotes unquoted value %j', (value, expected) => {
    expect(formatEntry({ ...base, value })).toBe(`K=${expected}`);
  });

  it('does not double-escape already escaped quotes', () => {
    expect(formatEntry({ ...base, quote: '"', value: 'a\\"b"c' })).toBe('K="a\\"b\\"c"');
  });

  it('leaves plain unquoted values alone', () => {
    expect(formatEntry({ ...base, value: 'postgres://h:5432/db' })).toBe('K=postgres://h:5432/db');
  });
});

describe('comment helpers', () => {
  it('commentText strips "#" and one following space', () => {
    expect(commentText(['# a', '#b', '#', '#   indented'])).toBe('a\nb\n\n  indented');
  });

  it('toCommentLines returns [] for empty text', () => {
    expect(toCommentLines('')).toEqual([]);
    expect(toCommentLines('x\n\ny')).toEqual(['# x', '#', '# y']);
  });
});
