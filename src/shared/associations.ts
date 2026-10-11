/** Glob patterns of the files Dotenv Manager edits (keep in sync with package.json customEditors selectors). */
export const ENV_FILE_PATTERNS = ['.env', '*.env', '.env.*'] as const;

/** viewType of the Dotenv Manager custom editor. */
export const DOTENV_VIEW_TYPE = 'dotenvManager.editor';

export type DefaultView = 'visual' | 'text';

/** The built-in text editor's id in `workbench.editorAssociations`. */
const TEXT_EDITOR = 'default';

/**
 * New `workbench.editorAssociations` value that makes `view` the default editor for
 * .env files, or undefined when the current value already does.
 *
 * Dotenv Manager is the contributed default, so "visual" only writes entries when
 * some pattern is currently associated with another editor (e.g. after choosing "text").
 */
export function nextAssociations(
  current: Record<string, string> | undefined,
  view: DefaultView,
  viewType: string,
): Record<string, string> | undefined {
  const existing = current ?? {};
  const target = view === 'text' ? TEXT_EDITOR : viewType;
  const mismatched = ENV_FILE_PATTERNS.filter((p) => existing[p] !== target);
  if (mismatched.length === 0) {
    return undefined;
  }
  if (view === 'visual' && ENV_FILE_PATTERNS.every((p) => existing[p] === undefined)) {
    return undefined;
  }
  const next = { ...existing };
  for (const pattern of ENV_FILE_PATTERNS) {
    next[pattern] = target;
  }
  return next;
}
