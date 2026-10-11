/** viewType of the Dotenv Manager custom editor. */
export const DOTENV_VIEW_TYPE = 'dotenvManager.editor';

/** The built-in text editor's id in `workbench.editorAssociations`. */
const TEXT_EDITOR = 'default';

/** Patterns earlier versions wrote besides the `dotenvManager.envFiles` names. */
const LEGACY_PATTERNS = ['.env', '.env.*', '*.env'];

/**
 * `workbench.editorAssociations` without the entries earlier versions wrote to make Dotenv Manager
 * (or the text editor) the default for .env files, or undefined when there is nothing to remove.
 * Dotenv Manager now opens only on request ("Open with Dotenv Manager"), never by default.
 */
export function withoutDotenvAssociations(
  current: Record<string, string> | undefined,
  viewType: string,
  patterns: readonly string[],
): Record<string, string> | undefined {
  if (!current) {
    return undefined;
  }
  const written = new Set([...patterns, ...LEGACY_PATTERNS]);
  const next = Object.fromEntries(
    Object.entries(current).filter(
      ([pattern, editor]) => editor !== viewType && !(editor === TEXT_EDITOR && written.has(pattern)),
    ),
  );
  return Object.keys(next).length === Object.keys(current).length ? undefined : next;
}
