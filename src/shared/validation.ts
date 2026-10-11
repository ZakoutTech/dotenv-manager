/** Validation rules shared by the edit layer and the webview (keep free of vscode/DOM imports). */

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

/** Error message for an invalid variable name, or undefined when valid. */
export function keyError(key: string): string | undefined {
  if (key === '') {
    return 'Variable name is required.';
  }
  if (!KEY_RE.test(key)) {
    return `Invalid variable name "${key}": use letters, digits and _ (not starting with a digit).`;
  }
  return undefined;
}

/** Error message for an invalid group name, or undefined when valid. */
export function groupNameError(name: string): string | undefined {
  const trimmed = name.trim();
  if (trimmed === '') {
    return 'Group name is required.';
  }
  if (trimmed.includes('===') || /[\r\n]/.test(trimmed)) {
    return `Invalid group name "${name}": it cannot contain "===" or line breaks.`;
  }
  return undefined;
}
