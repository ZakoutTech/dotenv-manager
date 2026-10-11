import * as vscode from 'vscode';
import { createEnvFileMatcher, DEFAULT_ENV_FILES, envFilePatterns } from '../shared/envFiles';

export const ENV_FILES_SETTING = 'dotenvManager.envFiles';

/** The `dotenvManager.envFiles` patterns: the only file names Dotenv Manager detects and opens. */
export function configuredEnvFiles(): string[] {
  return envFilePatterns(vscode.workspace.getConfiguration('dotenvManager').get<unknown>('envFiles', DEFAULT_ENV_FILES));
}

let cache: { key: string; matches: (name: string) => boolean } | undefined;

/** True when the file's name matches `dotenvManager.envFiles`. */
export function isEnvFile(uri: vscode.Uri): boolean {
  const patterns = configuredEnvFiles();
  const key = JSON.stringify(patterns);
  if (cache?.key !== key) {
    cache = { key, matches: createEnvFileMatcher(patterns) };
  }
  return cache.matches(uri.path.slice(uri.path.lastIndexOf('/') + 1));
}
