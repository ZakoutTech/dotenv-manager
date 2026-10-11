import { describe, expect, it } from 'vitest';
import { applyCompletion, completionContext, suggest } from '../../../src/webview/completion';

describe('completionContext', () => {
  it('detects a ${ prefix before the caret', () => {
    expect(completionContext('x${DB_H', 7)).toEqual({ prefix: 'DB_H', start: 3 });
    expect(completionContext('x${', 3)).toEqual({ prefix: '', start: 3 });
  });

  it('ignores closed, escaped or absent references', () => {
    expect(completionContext('x${A}', 5)).toBeNull();
    expect(completionContext('x\\${A', 5)).toBeNull();
    expect(completionContext('plain', 5)).toBeNull();
  });
});

describe('suggest', () => {
  it('filters keys case-insensitively by prefix, unique, excluding the current key', () => {
    expect(suggest(['DB_HOST', 'db_port', 'API', 'DB_HOST', 'DB_URL'], 'db_', 'DB_URL')).toEqual(['DB_HOST', 'db_port']);
  });
});

describe('applyCompletion', () => {
  it('inserts the name and closing brace', () => {
    expect(applyCompletion('x${DB_H', 7, { prefix: 'DB_H', start: 3 }, 'DB_HOST')).toEqual({ text: 'x${DB_HOST}', caret: 11 });
  });

  it('replaces an existing partial name and brace after the caret', () => {
    expect(applyCompletion('${DB_Hxx}/y', 5, { prefix: 'DB_', start: 2 }, 'DB_HOST')).toEqual({ text: '${DB_HOST}/y', caret: 10 });
  });
});
