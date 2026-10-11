/**
 * Browser stand-in for the extension host, used by `npm run preview`.
 * Runs the real parse → applyIntent → serialize pipeline against an in-memory
 * .env text and talks to the webview through the same messages as VS Code.
 * Must be imported before the webview entry point (it defines acquireVsCodeApi).
 */
import { applyIntent, EditError } from '../src/core/edits';
import { parse } from '../src/core/parse';
import { serialize } from '../src/core/serialize';
import { toViewDocument } from '../src/core/viewModel';
import type { DefaultView } from '../src/shared/associations';
import type { FromWebviewMessage, ToWebviewMessage } from '../src/shared/protocol';

const SAMPLE = `# Local development settings
NODE_ENV=development

# === Database ===
# Connection settings for the primary Postgres instance

# Hostname of the DB server
DB_HOST=localhost
# DB_HOST=staging-db.internal
DB_PORT=5432
DB_URL=postgres://\${DB_HOST}:\${DB_PORT}/app
DB_REPLICA=\${DB_HOSTS}

# === API ===
# Get this from the dashboard
API_KEY="abc 123"
# Old key, kept for rollback
# API_KEY="old 999"
API_TIMEOUT=30 # seconds
NODE_ENV=test
`;

const STORAGE_KEY = 'dotenv-manager-preview-text';

let text = load();
let version = 1;
const undoStack: string[] = [];
const redoStack: string[] = [];

const source = document.getElementById('source') as HTMLTextAreaElement;
const undoButton = document.getElementById('undo') as HTMLButtonElement;
const redoButton = document.getElementById('redo') as HTMLButtonElement;

function load(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? SAMPLE;
  } catch {
    return SAMPLE;
  }
}

function send(message: ToWebviewMessage): void {
  window.postMessage(message, '*');
}

function publish(): void {
  try {
    localStorage.setItem(STORAGE_KEY, text);
  } catch {
    // Storage may be unavailable (private mode); the preview still works.
  }
  if (document.activeElement !== source) {
    source.value = text;
  }
  undoButton.disabled = undoStack.length === 0;
  redoButton.disabled = redoStack.length === 0;
  send({ type: 'update', version, doc: toViewDocument(parse(text)), text });
}

/** Replace the document text, recording an undo step (like one WorkspaceEdit). */
function setText(next: string): void {
  if (next === text) {
    return;
  }
  undoStack.push(text);
  redoStack.length = 0;
  text = next;
  version++;
}

let defaultView: DefaultView = 'visual';

function handle(message: FromWebviewMessage): void {
  switch (message.type) {
    case 'ready':
      send({ type: 'settings', defaultView });
      publish();
      return;
    case 'setDefaultView':
      defaultView = message.view;
      send({ type: 'settings', defaultView });
      return;
    case 'openAsText':
      // The text pane plays the role of the text editor here.
      source.focus();
      return;
    case 'edit':
      break;
  }
  if (message.version !== version) {
    publish();
    return;
  }
  try {
    setText(serialize(applyIntent(parse(text), message.intent)));
  } catch (err) {
    if (!(err instanceof EditError)) {
      throw err;
    }
    send({ type: 'error', message: err.message });
    return;
  }
  publish();
}

(globalThis as { acquireVsCodeApi?: unknown }).acquireVsCodeApi = () => ({
  // Answer asynchronously, as the real extension host does.
  postMessage: (message: FromWebviewMessage) => setTimeout(() => handle(message), 0),
});

// Typing in the text pane simulates editing the file in the text editor.
source.addEventListener('input', () => {
  setText(source.value);
  publish();
});

function step(from: string[], to: string[]): void {
  const previous = from.pop();
  if (previous !== undefined) {
    to.push(text);
    text = previous;
    version++;
    publish();
  }
}
undoButton.addEventListener('click', () => step(undoStack, redoStack));
redoButton.addEventListener('click', () => step(redoStack, undoStack));

document.getElementById('reset')?.addEventListener('click', () => {
  setText(SAMPLE);
  publish();
});

const themeButton = document.getElementById('theme') as HTMLButtonElement;
themeButton.addEventListener('click', () => {
  const light = document.body.classList.toggle('vscode-light');
  document.body.classList.toggle('vscode-dark', !light);
  themeButton.textContent = light ? 'Dark theme' : 'Light theme';
});
