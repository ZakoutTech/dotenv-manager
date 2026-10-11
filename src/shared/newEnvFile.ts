import { isEnvFileName } from './envFiles';

/** `./apps\api//.env` → `apps/api/.env` */
export function normalizeNewEnvFilePath(input: string): string {
  return input
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
    .join('/');
}

/** Problem with a path typed for a new .env file (relative to a workspace folder), or undefined. */
export function newEnvFilePathError(input: string): string | undefined {
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
  if (!isEnvFileName(segments[segments.length - 1] ?? '')) {
    return 'The file must be named .env, .env.<name> or <name>.env.';
  }
  return undefined;
}
