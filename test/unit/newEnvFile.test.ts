import { describe, expect, it } from 'vitest';
import { newEnvFilePathError, normalizeNewEnvFilePath } from '../../src/shared/newEnvFile';

const FILES = ['.env', '.env.local', '.env.test', '*.env'];

describe('newEnvFilePathError', () => {
  it.each(['.env', '.env.local', 'apps/api/.env', 'staging.env', 'apps\\\\api\\\\.env.test'])('accepts %s', (input) => {
    expect(newEnvFilePathError(input, FILES)).toBeUndefined();
  });

  it.each([
    ['', 'Enter a file name'],
    ['config.json', '"Env Files" setting: .env, .env.local, .env.test, *.env'],
    ['.env.staging', '"Env Files" setting'],
    ['/etc/.env', 'relative'],
    ['C:\\\\x\\\\.env', 'relative'],
    ['../.env', 'inside the folder'],
    ['a/../../.env', 'inside the folder'],
    ['apps/', '"Env Files" setting'],
  ])('rejects %s', (input, message) => {
    expect(newEnvFilePathError(input, FILES)).toContain(message);
  });

  it('explains an empty envFiles list', () => {
    expect(newEnvFilePathError('.env', [])).toContain('setting is empty');
  });
});

describe('normalizeNewEnvFilePath', () => {
  it('trims, converts backslashes and drops ./ and empty segments', () => {
    expect(normalizeNewEnvFilePath('  ./apps\\\\api//.env.local ')).toBe('apps/api/.env.local');
  });
});
