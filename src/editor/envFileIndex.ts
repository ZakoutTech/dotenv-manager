import * as path from 'node:path';
import * as vscode from 'vscode';
import { sortEnvFiles, type EnvFile } from '../core/envFileList';
import { isEnvFileName } from '../shared/envFiles';

const INCLUDE = '**/{.env,.env.*,*.env}';
const EXCLUDED_DIRS = ['node_modules', '.git', 'dist', 'out', 'build', '.next', 'coverage', 'vendor'];
const EXCLUDE = `**/{${EXCLUDED_DIRS.join(',')}}/**`;
export const MAX_FILES = 1000;
const NEW_FOLDER_DELAY_MS = 500;

const isExcluded = (relativePath: string): boolean =>
  relativePath.split('/').some((segment) => EXCLUDED_DIRS.includes(segment));

type Change = { op: 'add'; file: EnvFile } | { op: 'remove'; uri: string };

/** Live list of the .env files in the workspace folders (recursive, common build/vendor dirs skipped). */
export class EnvFileIndex implements vscode.Disposable {
  private files = new Map<string, EnvFile>();
  private scan: Promise<void> | undefined;
  private scanned = false;
  private truncatedScan = false;
  /** Incremented per full scan; results of an older scan are discarded. */
  private generation = 0;
  /** Watcher changes seen while a full scan is running, re-applied on top of its result. */
  private changesDuringScan: Change[] | undefined;
  private newFolders = new Set<string>();
  private newFolderTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly changed = new vscode.EventEmitter<void>();
  private readonly disposables: vscode.Disposable[] = [this.changed];

  readonly onDidChange = this.changed.event;

  constructor() {
    // Watch every path (content changes ignored): deleting or renaming a folder only reports
    // the folder itself, never the .env files inside it.
    const watcher = vscode.workspace.createFileSystemWatcher('**/*', false, true, false);
    this.disposables.push(
      watcher,
      watcher.onDidCreate((uri) => void this.created(uri)),
      watcher.onDidDelete((uri) => this.apply({ op: 'remove', uri: uri.toString() })),
      vscode.workspace.onDidChangeWorkspaceFolders(() => void this.rescan()),
      { dispose: () => clearTimeout(this.newFolderTimer) },
    );
    void this.rescan();
  }

  /** False until the first scan has finished. */
  get ready(): boolean {
    return this.scanned;
  }

  /** True when the last full scan hit the file limit, so the list may be incomplete. */
  get truncated(): boolean {
    return this.truncatedScan;
  }

  list(): EnvFile[] {
    return sortEnvFiles([...this.files.values()]);
  }

  /** Resolves when the current scan (if any) has finished. */
  whenReady(): Promise<void> {
    return this.scan ?? Promise.resolve();
  }

  rescan(): Promise<void> {
    const generation = ++this.generation;
    this.changesDuringScan = [];
    const scan = (async () => {
      const uris = await vscode.workspace.findFiles(INCLUDE, EXCLUDE, MAX_FILES);
      if (generation !== this.generation) {
        return; // A newer scan started; its result wins.
      }
      const files = new Map<string, EnvFile>();
      for (const uri of uris) {
        const file = this.toEnvFile(uri);
        if (file) {
          files.set(file.uri, file);
        }
      }
      for (const change of this.changesDuringScan ?? []) {
        applyChange(files, change);
      }
      this.changesDuringScan = undefined;
      this.files = files;
      this.truncatedScan = uris.length >= MAX_FILES;
      this.scanned = true;
      this.changed.fire();
    })();
    this.scan = scan.then(() => (generation === this.generation ? undefined : this.scan));
    return this.scan;
  }

  private apply(change: Change): void {
    this.changesDuringScan?.push(change);
    if (applyChange(this.files, change)) {
      this.changed.fire();
    }
  }

  private async created(uri: vscode.Uri): Promise<void> {
    const relativePath = this.relativePath(uri);
    if (relativePath === undefined || isExcluded(relativePath)) {
      return;
    }
    const file = this.toEnvFile(uri);
    if (file) {
      this.apply({ op: 'add', file });
      return;
    }
    try {
      // A new folder (e.g. a renamed or moved one) may contain .env files without reporting them.
      if ((await vscode.workspace.fs.stat(uri)).type & vscode.FileType.Directory) {
        this.newFolders.add(uri.toString());
        clearTimeout(this.newFolderTimer);
        this.newFolderTimer = setTimeout(() => void this.scanNewFolders(), NEW_FOLDER_DELAY_MS);
      }
    } catch {
      // Already gone again.
    }
  }

  /** Search only the folders created recently (not the whole workspace) and merge what they hold. */
  private async scanNewFolders(): Promise<void> {
    const folders = [...this.newFolders].sort();
    this.newFolders.clear();
    // Skip folders nested in another new folder: the outer search covers them.
    const roots = folders.filter((f, i) => !folders.slice(0, i).some((outer) => f.startsWith(`${outer}/`)));
    for (const root of roots) {
      const uris = await vscode.workspace.findFiles(new vscode.RelativePattern(vscode.Uri.parse(root), INCLUDE), EXCLUDE, MAX_FILES);
      for (const uri of uris) {
        const file = this.toEnvFile(uri);
        if (file) {
          this.apply({ op: 'add', file });
        }
      }
    }
  }

  private relativePath(uri: vscode.Uri): string | undefined {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    return folder ? path.posix.relative(folder.uri.path, uri.path) : undefined;
  }

  private toEnvFile(uri: vscode.Uri): EnvFile | undefined {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (!folder || !isEnvFileName(path.posix.basename(uri.path))) {
      return undefined;
    }
    const relativePath = path.posix.relative(folder.uri.path, uri.path);
    if (isExcluded(relativePath)) {
      return undefined;
    }
    return { uri: uri.toString(), folder: folder.name, folderIndex: folder.index, relativePath };
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}

/** Apply a watcher change to a file map; a removed folder drops every file below it. Returns true if it changed. */
function applyChange(files: Map<string, EnvFile>, change: Change): boolean {
  if (change.op === 'add') {
    if (files.has(change.file.uri)) {
      return false;
    }
    files.set(change.file.uri, change.file);
    return true;
  }
  const prefix = `${change.uri}/`;
  let removed = false;
  for (const key of [...files.keys()]) {
    if (key === change.uri || key.startsWith(prefix)) {
      files.delete(key);
      removed = true;
    }
  }
  return removed;
}
