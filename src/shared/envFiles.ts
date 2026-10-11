import { globToRegExp } from './excludes';

/**
 * Default of the `dotenvManager.envFiles` setting (keep in sync with package.json): the file names
 * Dotenv Manager detects and opens. Anything else (`.env.ts`, `.env.json`, …) is left to its own editor.
 */
export const DEFAULT_ENV_FILES = ['.env', '.env.local', '.env.development', '.env.production', '.env.test', '.env.example'];

/** Setting value → usable file name patterns: trimmed, de-duplicated, no paths. Non-arrays fall back to the default. */
export function envFilePatterns(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return DEFAULT_ENV_FILES;
  }
  const patterns = value
    .filter((p): p is string => typeof p === 'string')
    .map((p) => p.trim())
    .filter((p) => p !== '' && !p.includes('/') && !p.includes('\\'));
  return [...new Set(patterns)];
}

/** Predicate for file names (not paths). Patterns may use `*`, `?`, `{a,b}` and `[abc]`. */
export function createEnvFileMatcher(patterns: readonly string[]): (name: string) => boolean {
  const regexps = patterns.map(globToRegExp);
  return (name) => regexps.some((re) => re.test(name));
}

/** `{a,b}x` → `ax`, `bx` (one level), because VS Code globs cannot nest brace groups. */
function expandBraces(pattern: string): string[] {
  const match = /\{([^{}]*)\}/.exec(pattern);
  if (!match) {
    return [pattern];
  }
  const head = pattern.slice(0, match.index);
  const tail = pattern.slice(match.index + match[0].length);
  return match[1].split(',').flatMap((alt) => expandBraces(head + alt + tail));
}

/** Include glob for `workspace.findFiles`, or undefined when there is nothing to search for. */
export function envFilesInclude(patterns: readonly string[]): string | undefined {
  const names = [...new Set(patterns.flatMap(expandBraces))];
  return names.length > 0 ? `**/{${names.join(',')}}` : undefined;
}

/** Patterns without glob syntax, i.e. literal file names. */
export function literalEnvFileNames(patterns: readonly string[]): string[] {
  return patterns.filter((p) => !/[*?{}[\]]/.test(p));
}
