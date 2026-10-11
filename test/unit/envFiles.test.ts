import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createEnvFileMatcher,
  DEFAULT_ENV_FILES,
  envFilePatterns,
  envFilesInclude,
  literalEnvFileNames,
} from '../../src/shared/envFiles';

describe('createEnvFileMatcher', () => {
  const matches = createEnvFileMatcher(DEFAULT_ENV_FILES);

  it.each(['.env', '.env.local', '.env.development', '.env.production', '.env.test', '.env.example'])(
    'accepts the default %s',
    (name) => expect(matches(name)).toBe(true),
  );

  it.each(['.env.ts', '.env.d.ts', '.env.json', '.env.staging', 'staging.env', '.envrc', 'env', '.env.local.bak'])(
    'rejects %s by default',
    (name) => expect(matches(name)).toBe(false),
  );

  it('supports glob patterns on file names', () => {
    const custom = createEnvFileMatcher(['.env.*.local', '*.env', '.env.{qa,uat}']);
    expect(['.env.development.local', 'staging.env', '.env.qa', '.env.uat'].every(custom)).toBe(true);
    expect(['.env.local', '.env.prod', '.env.ts'].some(custom)).toBe(false);
  });

  it('matches nothing for an empty list', () => {
    expect(createEnvFileMatcher([])('.env')).toBe(false);
  });
});

describe('envFilePatterns', () => {
  it('trims, de-duplicates and drops entries with folders', () => {
    expect(envFilePatterns([' .env ', '.env', '', 'apps/.env', 'a\\b', 3, '.env.qa'])).toEqual(['.env', '.env.qa']);
  });

  it('falls back to the default for a non-array value', () => {
    expect(envFilePatterns('nope')).toEqual(DEFAULT_ENV_FILES);
  });

  it('keeps an explicitly empty list', () => {
    expect(envFilePatterns([])).toEqual([]);
  });
});

describe('envFilesInclude', () => {
  it('builds a findFiles glob, expanding braces', () => {
    expect(envFilesInclude(['.env', '.env.{qa,uat}', '*.env'])).toBe('**/{.env,.env.qa,.env.uat,*.env}');
  });

  it('is undefined for an empty list', () => {
    expect(envFilesInclude([])).toBeUndefined();
  });
});

describe('literalEnvFileNames', () => {
  it('keeps only names without glob syntax', () => {
    expect(literalEnvFileNames(['.env', '.env.*.local', '.env.{a,b}', '.env.[ab]', '.env.qa'])).toEqual(['.env', '.env.qa']);
  });
});

describe('package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

  it('declares the same envFiles default', () => {
    expect(pkg.contributes.configuration.properties['dotenvManager.envFiles'].default).toEqual(DEFAULT_ENV_FILES);
  });

  it('never makes the custom editor the default by itself', () => {
    expect(pkg.contributes.customEditors[0].priority).toBe('option');
  });
});
