import * as vscode from 'vscode';
import { createNonce, getWebviewHtml } from './webviewHtml';

export class DotenvEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = 'dotenvManager.editor';

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      DotenvEditorProvider.viewType,
      new DotenvEditorProvider(context.extensionUri),
    );
  }

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveCustomTextEditor(_document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel): void {
    const distUri = vscode.Uri.joinPath(this.extensionUri, 'dist');
    const { webview } = webviewPanel;
    webview.options = { enableScripts: true, localResourceRoots: [distUri] };
    webview.html = getWebviewHtml({
      nonce: createNonce(),
      scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'webview.js')).toString(),
      cspSource: webview.cspSource,
    });
  }
}
