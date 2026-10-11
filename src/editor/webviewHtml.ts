export interface WebviewHtmlOptions {
  /** Per-render nonce that whitelists our script in the CSP. */
  nonce: string;
  /** Webview-safe URI of dist/webview.js (from webview.asWebviewUri). */
  scriptUri: string;
  /** Webview-safe URI of dist/webview.css. */
  styleUri: string;
  /** webview.cspSource, used to allow our own styles. */
  cspSource: string;
}

const NONCE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => NONCE_CHARS[b % NONCE_CHARS.length]).join('');
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function getWebviewHtml({ nonce, scriptUri, styleUri, cspSource }: WebviewHtmlOptions): string {
  const n = escapeAttr(nonce);
  const csp = [
    "default-src 'none'",
    `style-src ${escapeAttr(cspSource)} 'unsafe-inline'`,
    `script-src 'nonce-${n}'`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${escapeAttr(styleUri)}">
  <title>Dotenv Manager</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${n}" src="${escapeAttr(scriptUri)}"></script>
</body>
</html>`;
}
