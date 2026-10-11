/**
 * Glob excludes for .env detection (the dotenvManager.exclude setting). Patterns are matched
 * against workspace-relative paths. A pattern without a slash matches that name at any depth
 * ("vendor" behaves like "**" + "/vendor"), and a pattern that matches a folder excludes
 * everything inside it. Supported syntax: double star, star, ?, {a,b}, [abc] and [!abc].
 */

/** Default of the `dotenvManager.exclude` setting (keep in sync with package.json). */
export const DEFAULT_EXCLUDES = [
  '**/node_modules',
  '**/.git',
  '**/dist',
  '**/out',
  '**/build',
  '**/.next',
  '**/coverage',
  '**/vendor',
];

const normalize = (pattern: string): string => {
  const trimmed = pattern.trim().replace(/\/+$/, '');
  return trimmed.includes('/') ? trimmed : `**/${trimmed}`;
};

export function globToRegExp(pattern: string): RegExp {
  const glob = normalize(pattern);
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        out += '(?:.*/)?';
        i += 2;
      } else {
        out += '.*';
        i += 1;
      }
    } else if (c === '*') {
      out += '[^/]*';
    } else if (c === '?') {
      out += '[^/]';
    } else if (c === '{') {
      const close = glob.indexOf('}', i);
      if (close < 0) {
        out += '\\{';
      } else {
        out += `(?:${glob
          .slice(i + 1, close)
          .split(',')
          .map((alt) => alt.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]'))
          .join('|')})`;
        i = close;
      }
    } else if (c === '[') {
      const close = glob.indexOf(']', i);
      if (close < 0) {
        out += '\\[';
      } else {
        const body = glob.slice(i + 1, close).replace(/\\/g, '\\\\');
        out += body.startsWith('!') ? `[^${body.slice(1)}]` : `[${body}]`;
        i = close;
      }
    } else {
      out += c.replace(/[.+^$()|\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${out}$`);
}

/** Predicate for workspace-relative file paths; true when the file or one of its folders is excluded. */
export function createExcludeMatcher(patterns: readonly string[]): (relativePath: string) => boolean {
  const regexps = patterns.filter((p) => p.trim() !== '').map(globToRegExp);
  return (relativePath) => {
    const segments = relativePath.split('/');
    for (let end = 1; end <= segments.length; end++) {
      const prefix = segments.slice(0, end).join('/');
      if (regexps.some((re) => re.test(prefix))) {
        return true;
      }
    }
    return false;
  };
}

/**
 * Exclude glob for `workspace.findFiles`, so excluded folders are not even searched. Patterns
 * with braces are left out (VS Code globs cannot nest brace groups); results are filtered with
 * createExcludeMatcher anyway, so they still apply.
 */
export function findFilesExclude(patterns: readonly string[]): string | undefined {
  const parts = patterns
    .map((p) => p.trim())
    .filter((p) => p !== '' && !p.includes('{') && !p.includes('}'))
    .map(normalize)
    .flatMap((p) => [p, `${p}/**`]);
  return parts.length > 0 ? `{${parts.join(',')}}` : undefined;
}
