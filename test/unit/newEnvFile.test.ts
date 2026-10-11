import { describe, expect, it } from 'vitest';
import { newEnvFilePathError, normalizeNewEnvFilePath } from '../../src/shared/newEnvFile';

describe('newEnvFilePathError', () => {
  it.each(['.env', '.env.local', 'apps/api/.env', 'staging.env', 'apps\\\\api\\\\.env.test'])('accepts %s', (input) => {
    expect(newEnvFilePathError(input)).toBeUndefined();
  });

  it.each([
    ['', 'Enter a file name'],
    ['config.json', 'must be named .env'],
    ['/etc/.env', 'relative'],
    ['C:\\\\x\\\\.env', 'relative'],
    ['../.env', 'inside the folder'],
    ['a/../../.env', 'inside the folder'],
    ['apps/', 'must be named .env'],
  ])('rejects %s', (input, message) => {
    expect(newEnvFilePathError(input)).toContain(message);
  });
});

describe('normalizeNewEnvFilePath', () => {
  it('trims, converts backslashes and drops ./ and empty segments', () => {
    expect(normalizeNewEnvFilePath('  ./apps\\\\api//.env.local ')).toBe('apps/api/.env.local');
  });
});
