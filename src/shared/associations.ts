/** viewType of the Dotenv Manager custom editor. */
export const DOTENV_VIEW_TYPE = 'dotenvManager.editor';

export type DefaultView = 'visual' | 'text';

/** The built-in text editor's id in `workbench.editorAssociations`. */
const TEXT_EDITOR = 'default';

/** Patterns written by earlier versions; dropped when no longer listed, so `.env.*` can't claim `.env.ts`. */
const LEGACY_PATTERNS = ['.env.*', '*.env'];

/**
 * New `workbench.editorAssociations` value that opens the `dotenvManager.envFiles` patterns in
 * `view`, or undefined when the current value already does.
 *
 * The custom editor is only an "option" editor, so these entries are what make it the default.
 * Entries pointing at Dotenv Manager for patterns that are no longer listed are removed; other
 * editors' entries are kept.
 */
export function nextAssociations(
  current: Record<string, string> | undefined,
  view: DefaultView,
  viewType: string,
  patterns: readonly string[],
): Record<string, string> | undefined {
  const existing = current ?? {};
  const listed = new Set(patterns);
  const next: Record<string, string> = {};
  for (const [pattern, editor] of Object.entries(existing)) {
    const stale =
      !listed.has(pattern) &&
      (editor === viewType || (LEGACY_PATTERNS.includes(pattern) && editor === TEXT_EDITOR));
    if (!stale) {
      next[pattern] = editor;
    }
  }
  for (const pattern of patterns) {
    next[pattern] = view === 'text' ? TEXT_EDITOR : viewType;
  }
  const keys = new Set([...Object.keys(existing), ...Object.keys(next)]);
  return [...keys].some((k) => existing[k] !== next[k]) ? next : undefined;
}
