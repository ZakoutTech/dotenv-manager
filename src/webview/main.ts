import './styles.css';
import type { FromWebviewMessage, ToWebviewMessage } from '../shared/protocol';
import { createApp } from './app';
import { readInitialMessages } from './initialState';

declare function acquireVsCodeApi(): { postMessage(message: FromWebviewMessage): void };

const vscode = acquireVsCodeApi();
const app = createApp(document.getElementById('app') as HTMLElement, (message) => vscode.postMessage(message));
// Render the embedded document right away instead of waiting for the 'ready' round trip.
for (const message of readInitialMessages(document)) {
  app.receive(message);
}
window.addEventListener('message', (event: MessageEvent<ToWebviewMessage>) => app.receive(event.data));
