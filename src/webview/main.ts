import type { FromWebviewMessage, ToWebviewMessage } from '../shared/protocol';

declare function acquireVsCodeApi(): { postMessage(message: FromWebviewMessage): void };

// Placeholder renderer until the GUI lands (plan step 5): proves the sync round-trip.
const vscode = acquireVsCodeApi();
const app = document.getElementById('app') as HTMLElement;

window.addEventListener('message', (event: MessageEvent<ToWebviewMessage>) => {
  const message = event.data;
  if (message.type === 'update') {
    const count = message.doc.groups.reduce((n, g) => n + g.entries.length, 0);
    app.textContent = `Dotenv Manager: ${count} variables in ${message.doc.groups.length} groups`;
  }
});

vscode.postMessage({ type: 'ready' });
