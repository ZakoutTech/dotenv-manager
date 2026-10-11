/**
 * Messages exchanged between the extension host and the Dotenv Manager webview.
 * Imported by both bundles, so it must stay free of `vscode` and DOM imports.
 */

import type { Quote } from '../core/model';

/** Addresses a variable by its group and its position among that group's variables. */
export interface EntryRef {
  group: number;
  index: number;
}

export interface VariableChanges {
  key?: string;
  value?: string;
  quote?: Quote;
  exported?: boolean;
  /** Plain comment text shown above the variable; empty string removes it. */
  comment?: string;
  /** Plain inline comment text; `null` removes it. */
  inlineComment?: string | null;
}

export type EditIntent =
  | { type: 'addVariable'; group: number; key: string; value: string; comment?: string; index?: number }
  | { type: 'updateVariable'; ref: EntryRef; changes: VariableChanges }
  | { type: 'deleteVariable'; ref: EntryRef }
  | { type: 'moveVariable'; ref: EntryRef; toGroup: number; toIndex: number }
  | { type: 'addGroup'; name: string; comment?: string }
  | { type: 'renameGroup'; group: number; name: string }
  | { type: 'updateGroupComment'; group: number; comment: string }
  | { type: 'deleteGroup'; group: number; deleteVariables: boolean }
  | { type: 'moveGroup'; group: number; toIndex: number }
  | { type: 'sortGroup'; group: number }
  | { type: 'sortAll' };

export interface ViewEntry {
  key: string;
  value: string;
  quote: Quote;
  exported: boolean;
  comment: string;
  inlineComment?: string;
}

export interface ViewGroup {
  /** `null` for the implicit group before the first header. */
  name: string | null;
  comment: string;
  entries: ViewEntry[];
}

export interface ViewDocument {
  groups: ViewGroup[];
}

export type ToWebviewMessage =
  | { type: 'update'; version: number; doc: ViewDocument }
  | { type: 'error'; message: string };

export type FromWebviewMessage = { type: 'ready' } | { type: 'edit'; version: number; intent: EditIntent };
