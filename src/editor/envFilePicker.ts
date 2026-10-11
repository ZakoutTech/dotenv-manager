import * as vscode from 'vscode';
import { countVariables, pickerEntries } from '../core/envFileList';
import { DOTENV_VIEW_TYPE } from '../shared/associations';
import { activeEnvUri } from './activeEnv';
import { openEnvFile } from './defaultView';
import type { EnvFileIndex } from './envFileIndex';

interface FileItem extends vscode.QuickPickItem {
  uri?: string;
  create?: true;
}

const CREATE_ITEMS: FileItem[] = [
  { label: '', kind: vscode.QuickPickItemKind.Separator },
  { label: '$(add) Create .env file…', create: true, alwaysShow: true },
];

const OPEN_AS_TEXT: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('go-to-file'), tooltip: 'Open as Text' };
const OPEN_VISUAL: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('symbol-variable'), tooltip: 'Open with Dotenv Manager' };

const MAX_PARALLEL_READS = 16;
const MAX_COUNTED_BYTES = 1024 * 1024;

/** Variable count per file, reading at most MAX_PARALLEL_READS files at a time. */
async function variableCounts(uris: string[], cancelled: () => boolean): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const queue = [...uris];
  const worker = async (): Promise<void> => {
    for (let uri = queue.shift(); uri !== undefined && !cancelled(); uri = queue.shift()) {
      try {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.parse(uri));
        if (bytes.byteLength <= MAX_COUNTED_BYTES) {
          counts.set(uri, countVariables(new TextDecoder().decode(bytes)));
        }
      } catch {
        // Unreadable file: show it without a count.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL_READS, uris.length) }, worker));
  return counts;
}

/** Quick pick of the workspace's .env files; picking one opens it in the user's default editor. */
export async function selectEnvFile(index: EnvFileIndex): Promise<void> {
  const picker = vscode.window.createQuickPick<FileItem>();
  picker.title = 'Dotenv Manager';
  picker.matchOnDescription = true;
  picker.busy = !index.ready;
  picker.placeholder = 'Searching for .env files…';

  const build = (counts?: Map<string, number>): FileItem[] => [
    ...pickerEntries(index.list(), activeEnvUri()?.toString(), (vscode.workspace.workspaceFolders?.length ?? 0) > 1).map(
      (entry): FileItem =>
        entry.kind === 'separator'
          ? { label: entry.label, kind: vscode.QuickPickItemKind.Separator }
          : {
              label: `$(${entry.current ? 'pass-filled' : 'file'}) ${entry.label}`,
              description: entry.description,
              detail: counts?.has(entry.uri)
                ? `${counts.get(entry.uri)} variable${counts.get(entry.uri) === 1 ? '' : 's'}`
                : undefined,
              uri: entry.uri,
              buttons: [OPEN_AS_TEXT, OPEN_VISUAL],
            },
    ),
    ...CREATE_ITEMS,
  ];

  let disposed = false;
  let counts: Map<string, number> | undefined;

  const refresh = async (): Promise<void> => {
    const activeBefore = picker.activeItems[0]?.uri;
    picker.items = build(counts);
    restoreActive(activeBefore);
    picker.placeholder = index.list().length > 0 ? 'Select a .env file to open' : 'No .env files found in this workspace';
    counts = await variableCounts(
      index.list().map((f) => f.uri),
      () => disposed,
    );
    if (disposed) {
      return;
    }
    const activeUri = picker.activeItems[0]?.uri;
    picker.items = build(counts);
    restoreActive(activeUri);
  };

  /** Replacing items resets the highlight; keep it on the same file. */
  const restoreActive = (uri: string | undefined): void => {
    const active = picker.items.find((item) => item.uri !== undefined && item.uri === uri);
    if (active) {
      picker.activeItems = [active];
    }
  };

  const open = async (uri: string, viewType?: string): Promise<void> => {
    picker.hide();
    const target = vscode.Uri.parse(uri);
    await (viewType ? vscode.commands.executeCommand('vscode.openWith', target, viewType) : openEnvFile(target));
  };

  picker.onDidAccept(() => {
    if (picker.selectedItems[0]?.create) {
      picker.hide();
      void vscode.commands.executeCommand('dotenvManager.createEnvFile');
      return;
    }
    const uri = picker.selectedItems[0]?.uri;
    if (uri) {
      void open(uri);
    }
  });
  picker.onDidTriggerItemButton(({ item, button }) => {
    if (item.uri) {
      void open(item.uri, button === OPEN_AS_TEXT ? 'default' : DOTENV_VIEW_TYPE);
    }
  });
  // Files created or deleted while the picker is open show up immediately.
  const subscription = index.onDidChange(() => void refresh());
  picker.onDidHide(() => {
    disposed = true;
    subscription.dispose();
    picker.dispose();
  });

  picker.show();
  if (!index.ready) {
    await index.whenReady();
    if (disposed) {
      return;
    }
    picker.busy = false;
  }
  await refresh();
}
