import { parse } from './parse';

/** A detected .env file (plain data, so it can be sorted and formatted without the VS Code API). */
export interface EnvFile {
  /** `vscode.Uri.toString()` of the file. */
  uri: string;
  /** Name of the workspace folder it belongs to. */
  folder: string;
  /** Position of that folder in the workspace (keeps folder order stable). */
  folderIndex: number;
  /** Path relative to the workspace folder, with `/` separators. */
  relativePath: string;
}

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const dirName = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const depth = (path: string): number => path.split('/').length;

/** Folder order, then shallow before deep, then directory, then `.env` first and the rest by name. */
export function sortEnvFiles(files: EnvFile[]): EnvFile[] {
  return [...files].sort(
    (a, b) =>
      a.folderIndex - b.folderIndex ||
      depth(a.relativePath) - depth(b.relativePath) ||
      dirName(a.relativePath).localeCompare(dirName(b.relativePath)) ||
      Number(baseName(a.relativePath) !== '.env') - Number(baseName(b.relativePath) !== '.env') ||
      baseName(a.relativePath).localeCompare(baseName(b.relativePath)),
  );
}

export function statusBarText(count: number | undefined, truncated = false): string {
  return count === undefined
    ? '$(symbol-variable) Dotenv Manager'
    : `$(symbol-variable) Dotenv Manager (${count}${truncated ? '+' : ''})`;
}

/** File and folder names are user-controlled; escape them so they render as plain text. */
const escapeMarkdown = (text: string): string => text.replace(/[\\`*_{}[\]()#+\-.!|<>~]/g, '\\$&');

/** Markdown tooltip listing the detected files. */
export function statusBarTooltip(files: EnvFile[], multiRoot: boolean, max = 10): string {
  if (files.length === 0) {
    return '**Dotenv Manager**\n\nNo .env files found in this workspace.';
  }
  const lines = files.slice(0, max).map((f) => `- ${multiRoot ? `${escapeMarkdown(f.folder)}/` : ''}${escapeMarkdown(f.relativePath)}`);
  if (files.length > max) {
    lines.push(`- …and ${files.length - max} more`);
  }
  return `**Dotenv Manager**: ${files.length} .env file${files.length === 1 ? '' : 's'}\n\n${lines.join('\n')}\n\nClick to select a .env file`;
}

export type PickerEntry =
  | { kind: 'separator'; label: string }
  | { kind: 'file'; label: string; description: string; uri: string; current: boolean };

/** Quick-pick entries for sorted files: file name as label, its directory (or "current") as description. */
export function pickerEntries(files: EnvFile[], activeUri: string | undefined, multiRoot: boolean): PickerEntry[] {
  const entries: PickerEntry[] = [];
  let folder: string | undefined;
  for (const f of files) {
    if (multiRoot && f.folder !== folder) {
      folder = f.folder;
      entries.push({ kind: 'separator', label: f.folder });
    }
    const current = f.uri === activeUri;
    const dir = dirName(f.relativePath);
    entries.push({
      kind: 'file',
      label: baseName(f.relativePath),
      description: [current ? 'current' : '', dir].filter(Boolean).join(' · '),
      uri: f.uri,
      current,
    });
  }
  return entries;
}

export function countVariables(text: string): number {
  return parse(text).groups.reduce((n, g) => n + g.items.filter((i) => i.type === 'entry' && !i.disabled).length, 0);
}
