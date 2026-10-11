import './styles.css';
import type { FromWebviewMessage, ToWebviewMessage } from '../shared/protocol';
import { createApp } from './app';

declare function acquireVsCodeApi(): { postMessage(message: FromWebviewMessage): void };

const vscode = acquireVsCodeApi();
const app = createApp(document.getElementById('app') as HTMLElement, (message) => vscode.postMessage(message));

window.addEventListener('message', (event: MessageEvent<ToWebviewMessage>) => app.receive(event.data));
