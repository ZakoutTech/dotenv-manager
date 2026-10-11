import { describe, expect, it } from 'vitest';
import { tokenizeEnv, type PreviewLine } from '../../../src/webview/textPreview';

const kinds = (line: PreviewLine): string => line.tokens.map((t) => `${t.kind}:${t.text}`).join(' | ');

describe('tokenizeEnv', () => {
  it('colors headers, comments, entries and inline comments', () => {
    const lines = tokenizeEnv('# === DB ===\n# Host\nexport HOST=localhost # local\n\nPORT = 5432\n');
    expect(lines.map(kinds)).toEqual([
      'header:# === DB ===',
      'comment:# Host',
      'punct:export  | key:HOST | punct:= | value:localhost | comment: # local',
      '',
      'key:PORT | punct: =  | value:5432',
    ]);
  });

  it('marks commented-out variables but keeps prose as comments', () => {
    const [disabled, prose] = tokenizeEnv('# API_KEY="old 1"\n# Note = prose\n');
    expect(disabled.disabled).toBe(true);
    expect(kinds(disabled)).toBe('punct:#  | key:API_KEY | punct:= | value:"old 1"');
    expect(prose).toEqual({ tokens: [{ kind: 'comment', text: '# Note = prose' }] });
  });

  it('treats every line of a multiline quoted value as value', () => {
    const lines = tokenizeEnv('KEY="line 1\nline # 2\nend" # done\nNEXT=1\r\n');
    expect(lines.map(kinds)).toEqual([
      'key:KEY | punct:= | value:"line 1',
      'value:line # 2',
      'value:end" | comment: # done',
      'key:NEXT | punct:= | value:1',
    ]);
  });

  it('handles an empty file and a BOM', () => {
    expect(tokenizeEnv('')).toEqual([]);
    expect(kinds(tokenizeEnv('\uFEFFA=1')[0])).toBe('key:A | punct:= | value:1');
  });
});
