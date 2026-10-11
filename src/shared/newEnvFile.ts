import { createEnvFileMatcher } from './envFiles';

/** `./apps\api//.env` → `apps/api/.env` */
export function normalizeNewEnvFilePath(input: string): string {
  return input
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
    .join('/');
}

/**
 * Problem with a path typed for a new .env file (relative to a workspace folder), or undefined.
 * The name must match one of `patterns` (the `dotenvManager.envFiles` setting), or the file would not be detected.
 */
export function newEnvFilePathError(input: string, patterns: readonly string[]): string | undefined {
  const raw = input.trim().replace(/\\/g, '/');
  if (raw === '') {
    return 'Enter a file name, e.g. .env or apps/api/.env.local.';
  }
  if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) {
    return 'Use a path relative to the workspace folder.';
  }
  const segments = normalizeNewEnvFilePath(raw).split('/');
  if (segments.includes('..')) {
    return 'The file must stay inside the folder.';
  }
  if (patterns.length === 0) {
    return 'The Dotenv Manager "Env Files" setting is empty: add the file names to detect first.';
  }
  if (!createEnvFileMatcher(patterns)(segments[segments.length - 1] ?? '')) {
    return `Use one of the names in the Dotenv Manager "Env Files" setting: ${patterns.join(', ')}.`;
  }
  return undefined;
}
