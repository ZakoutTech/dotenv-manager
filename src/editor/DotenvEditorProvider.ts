import * as vscode from 'vscode';
import { EditError } from '../core/edits';
import { parse } from '../core/parse';
import { toViewDocument } from '../core/viewModel';
import type { FromWebviewMessage, ToWebviewMessage } from '../shared/protocol';
import { applyIntentToDocument } from './applyEdit';
import { createNonce, getWebviewHtml } from './webviewHtml';

/**
 * Custom text editor: the TextDocument stays the source of truth (so undo/redo,
 * dirty state and save are native). The webview renders a view model of the
 * parsed document and sends edit intents back; every intent becomes one
 * WorkspaceEdit, and every document change re-renders the webview.
 */
export class DotenvEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = 'dotenvManager.editor';

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      DotenvEditorProvider.viewType,
      new DotenvEditorProvider(context.extensionUri),
    );
  }

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel): void {
    const distUri = vscode.Uri.joinPath(this.extensionUri, 'dist');
    const { webview } = webviewPanel;
    webview.options = { enableScripts: true, localResourceRoots: [distUri] };
    webview.html = getWebviewHtml({
      nonce: createNonce(),
      scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'webview.js')).toString(),
      cspSource: webview.cspSource,
    });

    const post = (message: ToWebviewMessage): void => {
      void webview.postMessage(message);
    };
    const postUpdate = (): void => {
      post({ type: 'update', version: document.version, doc: toViewDocument(parse(document.getText())) });
    };

    const changeSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString() && e.contentChanges.length > 0) {
        postUpdate();
      }
    });
    webviewPanel.onDidDispose(() => changeSubscription.dispose());

    webview.onDidReceiveMessage(async (message: FromWebviewMessage) => {
      switch (message.type) {
        case 'ready':
          postUpdate();
          return;
        case 'edit':
          if (message.version !== document.version) {
            // The webview acted on an outdated view; re-sync instead of guessing.
            postUpdate();
            return;
          }
          try {
            if (!(await applyIntentToDocument(document, message.intent))) {
              post({ type: 'error', message: 'VS Code rejected the edit.' });
              postUpdate();
            }
          } catch (err) {
            if (err instanceof EditError) {
              post({ type: 'error', message: err.message });
            } else {
              console.error('[dotenv-manager] edit failed', err);
              post({ type: 'error', message: `Unexpected error: ${String(err)}` });
              postUpdate();
            }
          }
          return;
      }
    });
  }
}
