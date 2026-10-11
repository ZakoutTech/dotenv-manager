import { describe, expect, it } from 'vitest';
import { createExcludeMatcher, findFilesExclude, globToRegExp } from '../../src/shared/excludes';

describe('globToRegExp', () => {
  it.each([
    ['**/node_modules', 'node_modules', true],
    ['**/node_modules', 'a/b/node_modules', true],
    ['**/node_modules', 'a/node_modules_x', false],
    ['apps/*/secrets', 'apps/api/secrets', true],
    ['apps/*/secrets', 'apps/a/b/secrets', false],
    ['**/*.bak', 'x/y/.env.bak', true],
    ['**/{tmp,cache}', 'a/cache', true],
    ['**/{tmp,cache}', 'a/cached', false],
    ['**/.env.?', 'a/.env.1', true],
    ['**/[ab]', 'x/b', true],
    ['**/[!ab]', 'x/b', false],
    ['legacy/**', 'legacy/a/b', true],
  ])('%s matches %s → %s', (glob, path, expected) => {
    expect(globToRegExp(glob).test(path)).toBe(expected);
  });

  it('treats a pattern without a slash as a name anywhere in the tree', () => {
    expect(globToRegExp('vendor').test('a/vendor')).toBe(true);
    expect(globToRegExp('vendor').test('vendor')).toBe(true);
  });

  it('escapes regex characters', () => {
    expect(globToRegExp('**/a+b').test('a+b')).toBe(true);
    expect(globToRegExp('**/a+b').test('aab')).toBe(false);
  });
});

describe('createExcludeMatcher', () => {
  const excluded = createExcludeMatcher(['**/node_modules', '**/dist', 'apps/legacy']);

  it('excludes files inside an excluded folder at any depth', () => {
    expect(excluded('node_modules/pkg/.env')).toBe(true);
    expect(excluded('packages/web/dist/.env')).toBe(true);
    expect(excluded('apps/legacy/.env')).toBe(true);
  });

  it('keeps everything else', () => {
    expect(excluded('.env')).toBe(false);
    expect(excluded('apps/api/.env.local')).toBe(false);
    expect(excluded('packages/legacy/.env')).toBe(false);
  });

  it('can exclude individual files', () => {
    expect(createExcludeMatcher(['**/.env.example'])('a/.env.example')).toBe(true);
  });

  it('ignores blank patterns', () => {
    expect(createExcludeMatcher(['', '  '])('a/.env')).toBe(false);
  });
});

describe('findFilesExclude', () => {
  it('builds one brace group covering the folders and their contents', () => {
    expect(findFilesExclude(['**/node_modules', 'vendor'])).toBe('{**/node_modules,**/node_modules/**,**/vendor,**/vendor/**}');
  });

  it('leaves out patterns with braces (VS Code globs cannot nest them); they are filtered afterwards', () => {
    expect(findFilesExclude(['**/{a,b}', '**/dist'])).toBe('{**/dist,**/dist/**}');
  });

  it('returns undefined when there is nothing to exclude', () => {
    expect(findFilesExclude([])).toBeUndefined();
  });
});

describe('package.json', () => {
  it('uses DEFAULT_EXCLUDES as the default of dotenvManager.exclude', async () => {
    const { readFileSync } = await import('node:fs');
    const { DEFAULT_EXCLUDES } = await import('../../src/shared/excludes');
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.contributes.configuration.properties['dotenvManager.exclude'].default).toEqual(DEFAULT_EXCLUDES);
  });
});
