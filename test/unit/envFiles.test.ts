import { describe, expect, it } from 'vitest';
import { isEnvFileName } from '../../src/shared/envFiles';

describe('isEnvFileName', () => {
  it.each(['.env', '.env.local', '.env.production', 'staging.env'])('accepts %s', (name) => {
    expect(isEnvFileName(name)).toBe(true);
  });

  it.each(['env', '.envrc', 'environment.ts', '.env.'])('rejects %s', (name) => {
    expect(isEnvFileName(name)).toBe(false);
  });
});
