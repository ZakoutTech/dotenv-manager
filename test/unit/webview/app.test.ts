// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/webview/app';
import type { FromWebviewMessage, ViewDocument } from '../../../src/shared/protocol';

const DOC: ViewDocument = {
  groups: [
    { name: null, comment: '', entries: [{ key: 'TOP', value: '1', quote: '', exported: false, comment: '' }] },
    {
      name: 'Database',
      comment: 'Connection settings',
      entries: [
        { key: 'DB_HOST', value: 'localhost', quote: '', exported: false, comment: 'Hostname' },
        { key: 'DB_PORT', value: '5432', quote: '', exported: true, comment: '' },
      ],
    },
    { name: 'API', comment: '', entries: [{ key: 'TOP', value: 'dup', quote: '"', exported: false, comment: '' }] },
  ],
};

let root: HTMLElement;
let posted: FromWebviewMessage[];
let app: ReturnType<typeof createApp>;

const $ = <T extends Element = HTMLElement>(selector: string, scope: ParentNode = root): T => {
  const el = scope.querySelector<T>(selector);
  if (!el) {
    throw new Error(`No element for ${selector}`);
  }
  return el;
};
const $$ = (selector: string, scope: ParentNode = root): HTMLElement[] => [...scope.querySelectorAll<HTMLElement>(selector)];
const group = (i: number): HTMLElement => $(`[data-group="${i}"]`);
const row = (g: number, i: number): HTMLElement => $(`[data-row="${g}:${i}"]`);
const edits = () => posted.filter((m) => m.type === 'edit').map((m) => (m.type === 'edit' ? m.intent : undefined));

function type(el: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
function key(el: Element, k: string, init: KeyboardEventInit = {}): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));
}
const editor = (): HTMLInputElement | HTMLTextAreaElement => $<HTMLInputElement>('.inline-editor');

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app') as HTMLElement;
  posted = [];
  app = createApp(root, (m) => posted.push(m));
  app.receive({ type: 'update', version: 1, doc: DOC });
});

describe('rendering', () => {
  it('announces readiness', () => {
    expect(posted[0]).toEqual({ type: 'ready' });
  });

  it('renders named groups with their comments and the ungrouped section', () => {
    expect($('[data-action="rename-group"]', group(1)).textContent).toBe('Database');
    expect($('.group-comment', group(1)).textContent).toBe('Connection settings');
    expect($('.group-title', group(0)).textContent).toBe('Ungrouped');
    expect($$('[data-row]', group(1))).toHaveLength(2);
  });

  it('renders variable comments above the variable', () => {
    expect($('.var-comment', row(1, 0)).textContent).toBe('Hostname');
    expect(row(1, 1).querySelector('.var-comment')).toBeNull();
  });

  it('masks values by default and reveals per row or globally', () => {
    expect($('[data-action="edit-value"]', row(1, 0)).textContent).not.toContain('localhost');
    $('[data-action="reveal"]', row(1, 0)).click();
    expect($('[data-action="edit-value"]', row(1, 0)).textContent).toBe('localhost');
    expect($('[data-action="edit-value"]', row(1, 1)).textContent).not.toContain('5432');

    $('[data-action="reveal-all"]').click();
    expect($('[data-action="edit-value"]', row(1, 1)).textContent).toBe('5432');
  });

  it('flags duplicate keys', () => {
    expect(row(0, 0).querySelector('.badge-duplicate')).not.toBeNull();
    expect(row(2, 0).querySelector('.badge-duplicate')).not.toBeNull();
    expect(row(1, 0).querySelector('.badge-duplicate')).toBeNull();
  });

  it('collapses and expands a group', () => {
    const toggle = $('[data-action="toggle-group"]', group(1));
    toggle.click();
    expect($$('[data-row]', group(1))).toHaveLength(0);
    expect($('[data-action="toggle-group"]', group(1)).getAttribute('aria-expanded')).toBe('false');
    $('[data-action="toggle-group"]', group(1)).click();
    expect($$('[data-row]', group(1))).toHaveLength(2);
  });

  it('renders file text as text, never as HTML', () => {
    app.receive({
      type: 'update',
      version: 2,
      doc: { groups: [{ name: '<img src=x onerror=alert(1)>', comment: '<b>c</b>', entries: [] }] },
    });
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('b')).toBeNull();
  });
});

describe('editing variables', () => {
  it('edits a value with Enter and sends updateVariable', () => {
    $('[data-action="edit-value"]', row(1, 1)).click();
    type(editor(), '6543');
    key(editor(), 'Enter');
    expect(edits()).toEqual([{ type: 'updateVariable', ref: { group: 1, index: 1 }, changes: { value: '6543' } }]);
    expect(root.querySelector('.inline-editor')).toBeNull();
  });

  it('cancels an edit with Escape', () => {
    $('[data-action="edit-value"]', row(1, 1)).click();
    type(editor(), 'nope');
    key(editor(), 'Escape');
    expect(edits()).toEqual([]);
  });

  it('inserts a newline in a value with Shift+Enter instead of saving', () => {
    $('[data-action="edit-value"]', row(1, 1)).click();
    key(editor(), 'Enter', { shiftKey: true });
    expect(edits()).toEqual([]);
    expect(root.querySelector('.inline-editor')).not.toBeNull();
  });

  it('does not send an edit when nothing changed', () => {
    $('[data-action="edit-key"]', row(1, 0)).click();
    key(editor(), 'Enter');
    expect(edits()).toEqual([]);
  });

  it('renames a key and rejects invalid names inline', () => {
    $('[data-action="edit-key"]', row(1, 0)).click();
    type(editor(), '1BAD');
    key(editor(), 'Enter');
    expect(edits()).toEqual([]);
    expect($('.field-error').textContent).toContain('Invalid variable name');

    type(editor(), 'DB_HOSTNAME');
    key(editor(), 'Enter');
    expect(edits()).toEqual([{ type: 'updateVariable', ref: { group: 1, index: 0 }, changes: { key: 'DB_HOSTNAME' } }]);
  });

  it('edits the variable comment', () => {
    $('[data-action="edit-comment"]', row(1, 1)).click();
    type(editor(), 'Port number');
    key(editor(), 'Enter');
    expect(edits()).toEqual([{ type: 'updateVariable', ref: { group: 1, index: 1 }, changes: { comment: 'Port number' } }]);
  });

  it('toggles export', () => {
    $('[data-action="toggle-export"]', row(1, 1)).click();
    expect(edits()).toEqual([{ type: 'updateVariable', ref: { group: 1, index: 1 }, changes: { exported: false } }]);
  });

  it('deletes a variable', () => {
    $('[data-action="delete-variable"]', row(1, 0)).click();
    expect(edits()).toEqual([{ type: 'deleteVariable', ref: { group: 1, index: 0 } }]);
  });

  it('adds a variable through the inline form', () => {
    $('[data-action="add-variable"]', group(1)).click();
    const form = $('form.new-variable', group(1));
    type($<HTMLInputElement>('[name="key"]', form), 'DB_USER');
    type($<HTMLTextAreaElement>('[name="value"]', form), 'admin');
    type($<HTMLTextAreaElement>('[name="comment"]', form), 'Login');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(edits()).toEqual([{ type: 'addVariable', group: 1, key: 'DB_USER', value: 'admin', comment: 'Login' }]);
  });

  it('rejects an invalid key in the add form', () => {
    $('[data-action="add-variable"]', group(1)).click();
    const form = $('form.new-variable', group(1));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(edits()).toEqual([]);
    expect($('.field-error', group(1)).textContent).toBe('Variable name is required.');
  });
});

describe('editing groups', () => {
  it('renames a group', () => {
    $('[data-action="rename-group"]', group(2)).click();
    type(editor(), 'External API');
    key(editor(), 'Enter');
    expect(edits()).toEqual([{ type: 'renameGroup', group: 2, name: 'External API' }]);
  });

  it('edits the group comment', () => {
    $('[data-action="edit-group-comment"]', group(1)).click();
    type(editor(), '');
    key(editor(), 'Enter');
    expect(edits()).toEqual([{ type: 'updateGroupComment', group: 1, comment: '' }]);
  });

  it('asks before deleting a group, offering to keep its variables', () => {
    $('[data-action="delete-group"]', group(1)).click();
    expect(edits()).toEqual([]);
    $('[data-action="keep-variables"]', group(1)).click();
    expect(edits()).toEqual([{ type: 'deleteGroup', group: 1, deleteVariables: false }]);
  });

  it('deletes a group with its variables after confirmation', () => {
    $('[data-action="delete-group"]', group(2)).click();
    $('[data-action="confirm-delete-group"]', group(2)).click();
    expect(edits()).toEqual([{ type: 'deleteGroup', group: 2, deleteVariables: true }]);
  });

  it('adds a group from the toolbar', () => {
    $('[data-action="add-group"]').click();
    const form = $('form.new-group');
    type($<HTMLInputElement>('[name="name"]', form), 'Cache');
    type($<HTMLTextAreaElement>('[name="comment"]', form), 'Redis');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(edits()).toEqual([{ type: 'addGroup', name: 'Cache', comment: 'Redis' }]);
  });

  it('does not offer rename/delete on the ungrouped section', () => {
    expect(group(0).querySelector('[data-action="rename-group"]')).toBeNull();
    expect(group(0).querySelector('[data-action="delete-group"]')).toBeNull();
  });
});

describe('sorting', () => {
  it('sorts one group from its card', () => {
    $('[data-action="sort-group"]', group(1)).click();
    expect(edits()).toEqual([{ type: 'sortGroup', group: 1 }]);
  });

  it('disables group sorting with fewer than two variables', () => {
    expect($<HTMLButtonElement>('[data-action="sort-group"]', group(2)).disabled).toBe(true);
  });

  it('sorts all groups from the toolbar', () => {
    $('[data-action="sort-all"]').click();
    expect(edits()).toEqual([{ type: 'sortAll' }]);
  });
});

describe('drag and drop', () => {
  function drag(el: Element, type: string, clientY = 1): void {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clientY', { value: clientY });
    el.dispatchEvent(event);
  }

  it('makes rows and named group headers draggable', () => {
    expect(row(1, 0).getAttribute('draggable')).toBe('true');
    expect($('.group-header', group(1)).getAttribute('draggable')).toBe('true');
    expect($('.group-header', group(0)).getAttribute('draggable')).toBeNull();
  });

  it('reorders a variable within its group', () => {
    drag(row(1, 0), 'dragstart');
    drag(row(1, 1), 'dragover');
    expect(row(1, 1).classList.contains('drop-after')).toBe(true);
    drag(row(1, 1), 'drop');
    expect(edits()).toEqual([{ type: 'moveVariable', ref: { group: 1, index: 0 }, toGroup: 1, toIndex: 1 }]);
    expect(root.querySelector('.drop-after')).toBeNull();
  });

  it('drops before a row in another group', () => {
    drag(row(1, 1), 'dragstart');
    drag(row(2, 0), 'drop', -1);
    expect(edits()).toEqual([{ type: 'moveVariable', ref: { group: 1, index: 1 }, toGroup: 2, toIndex: 0 }]);
  });

  it('drops at the end of a group when released on the group card', () => {
    drag(row(1, 0), 'dragstart');
    drag(group(2), 'dragover');
    expect(group(2).classList.contains('drop-into')).toBe(true);
    drag(group(2), 'drop');
    expect(edits()).toEqual([{ type: 'moveVariable', ref: { group: 1, index: 0 }, toGroup: 2, toIndex: 1 }]);
  });

  it('ignores a drop onto the variable’s own slot', () => {
    drag(row(1, 0), 'dragstart');
    drag(row(1, 0), 'drop');
    expect(edits()).toEqual([]);
  });

  it('reorders groups by dragging the header', () => {
    drag($('.group-header', group(2)), 'dragstart');
    drag(group(1), 'dragover', -1);
    expect(group(1).classList.contains('group-drop-before')).toBe(true);
    drag(group(1), 'drop', -1);
    expect(edits()).toEqual([{ type: 'moveGroup', group: 2, toIndex: 1 }]);
  });

  it('does not render a row as draggable while it is being edited', () => {
    $('[data-action="edit-value"]', row(1, 0)).click();
    expect(row(1, 0).getAttribute('draggable')).toBe('false');
  });
});

describe('keyboard moves', () => {
  it('moves a variable with Alt+ArrowDown / Alt+ArrowUp', () => {
    key($('[data-action="edit-key"]', row(1, 0)), 'ArrowDown', { altKey: true });
    expect(edits()).toEqual([{ type: 'moveVariable', ref: { group: 1, index: 0 }, toGroup: 1, toIndex: 1 }]);
  });

  it('moves into the previous group from the top of a group', () => {
    key($('[data-action="move-variable"]', row(1, 0)), 'ArrowUp', { altKey: true });
    expect(edits()).toEqual([{ type: 'moveVariable', ref: { group: 1, index: 0 }, toGroup: 0, toIndex: 1 }]);
  });

  it('ignores Alt+Arrow inside an inline editor', () => {
    $('[data-action="edit-value"]', row(1, 0)).click();
    key(editor(), 'ArrowDown', { altKey: true });
    expect(edits()).toEqual([]);
  });

  it('moves a group with Alt+ArrowUp on its header', () => {
    key($('[data-action="rename-group"]', group(2)), 'ArrowUp', { altKey: true });
    expect(edits()).toEqual([{ type: 'moveGroup', group: 2, toIndex: 1 }]);
  });

  it('keeps focus on the moved variable after the document updates', () => {
    $('[data-action="move-variable"]', row(1, 0)).focus();
    key($('[data-action="move-variable"]', row(1, 0)), 'ArrowDown', { altKey: true });
    const moved: ViewDocument = structuredClone(DOC);
    moved.groups[1].entries.reverse();
    app.receive({ type: 'update', version: 2, doc: moved });
    expect(document.activeElement?.getAttribute('data-focus-id')).toBe('move-1:1');
  });
});

describe('references', () => {
  const REFS: ViewDocument = {
    groups: [
      {
        name: null,
        comment: '',
        entries: [
          { key: 'X', value: '123', quote: '', exported: false, comment: '' },
          { key: 'Y', value: '${X}', quote: '', exported: false, comment: '', references: ['X'], resolved: '123' },
          {
            key: 'Z',
            value: '${NOPE}',
            quote: '',
            exported: false,
            comment: '',
            references: ['NOPE'],
            resolved: '',
            warnings: ['Undefined variable NOPE'],
          },
        ],
      },
    ],
  };

  beforeEach(() => app.receive({ type: 'update', version: 2, doc: REFS }));

  it('shows the resolved value next to values with references, masked like the value', () => {
    expect(row(0, 0).querySelector('.resolved')).toBeNull();
    expect($('.resolved', row(0, 1)).textContent).not.toContain('123');
    $('[data-action="reveal-all"]').click();
    expect($('.resolved', row(0, 1)).textContent).toBe('→\u00a0123');
  });

  it('shows reference warnings', () => {
    expect($('.warning', row(0, 2)).textContent).toContain('Undefined variable NOPE');
    expect(row(0, 1).querySelector('.warning')).toBeNull();
  });

  it('suggests keys after ${ and inserts the chosen one', () => {
    $('[data-action="edit-value"]', row(0, 1)).click();
    type(editor(), 'a ${');
    expect($$('.completions [role="option"]').map((o) => o.textContent)).toEqual(['X', 'Z']);
    key(editor(), 'ArrowDown');
    key(editor(), 'Enter');
    expect(editor().value).toBe('a ${Z}');
    expect(root.querySelector('.completions')).toBeNull();
    expect(edits()).toEqual([]);

    key(editor(), 'Enter');
    expect(edits()).toEqual([{ type: 'updateVariable', ref: { group: 0, index: 1 }, changes: { value: 'a ${Z}' } }]);
  });

  it('closes suggestions with Escape without cancelling the edit', () => {
    $('[data-action="edit-value"]', row(0, 1)).click();
    type(editor(), '${');
    key(editor(), 'Escape');
    expect(root.querySelector('.completions')).toBeNull();
    expect(root.querySelector('.inline-editor')).not.toBeNull();
  });

  it('asks whether to update references when renaming a referenced variable', () => {
    $('[data-action="edit-key"]', row(0, 0)).click();
    type(editor(), 'X2');
    key(editor(), 'Enter');
    expect(edits()).toEqual([]);
    expect($('.confirm', row(0, 0)).textContent).toContain('1 variable references X');
    $('[data-action="rename-update"]', row(0, 0)).click();
    expect(edits()).toEqual([{ type: 'renameVariable', ref: { group: 0, index: 0 }, key: 'X2', updateReferences: true }]);
  });

  it('can rename without updating references', () => {
    $('[data-action="edit-key"]', row(0, 0)).click();
    type(editor(), 'X2');
    key(editor(), 'Enter');
    $('[data-action="rename-only"]', row(0, 0)).click();
    expect(edits()).toEqual([{ type: 'renameVariable', ref: { group: 0, index: 0 }, key: 'X2', updateReferences: false }]);
  });
});

describe('default editor', () => {
  it('shows the default-view picker once the extension reports the setting', () => {
    expect(root.querySelector('[data-action="default-view"]')).toBeNull();
    app.receive({ type: 'settings', defaultView: 'text' });
    expect($<HTMLSelectElement>('[data-action="default-view"]').value).toBe('text');
  });

  it('asks the extension to change the default view', () => {
    app.receive({ type: 'settings', defaultView: 'visual' });
    const select = $<HTMLSelectElement>('[data-action="default-view"]');
    select.value = 'text';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(posted.at(-1)).toEqual({ type: 'setDefaultView', view: 'text' });
    expect(edits()).toEqual([]);
  });

  it('asks the extension to reopen the file as text', () => {
    $('[data-action="open-as-text"]').click();
    expect(posted.at(-1)).toEqual({ type: 'openAsText' });
  });
});

describe('sync', () => {
  it('sends edits with the latest document version', () => {
    app.receive({ type: 'update', version: 7, doc: DOC });
    $('[data-action="delete-variable"]', row(1, 0)).click();
    expect(posted.at(-1)).toEqual({ type: 'edit', version: 7, intent: { type: 'deleteVariable', ref: { group: 1, index: 0 } } });
  });

  it('keeps a draft across an external update while editing', () => {
    $('[data-action="edit-value"]', row(1, 1)).click();
    type(editor(), 'draft');
    app.receive({ type: 'update', version: 2, doc: DOC });
    expect(editor().value).toBe('draft');
  });

  it('shows and dismisses extension errors', () => {
    app.receive({ type: 'error', message: 'Boom' });
    expect($('.error-banner').textContent).toContain('Boom');
    $('[data-action="dismiss-error"]').click();
    expect(root.querySelector('.error-banner')).toBeNull();
  });
});

describe('commented-out variables', () => {
  const WITH_DISABLED: ViewDocument = {
    groups: [
      {
        name: null,
        comment: '',
        entries: [
          { key: 'A', value: '1', quote: '', exported: false, comment: '' },
          { key: 'OLD', value: 'x', quote: '', exported: false, comment: '', disabled: true },
          { key: 'B', value: '2', quote: '', exported: false, comment: '' },
          { key: 'A', value: '0', quote: '', exported: false, comment: '', disabled: true },
        ],
      },
    ],
  };

  beforeEach(() => {
    app.receive({ type: 'update', version: 2, doc: WITH_DISABLED });
  });

  const toggle = (): HTMLInputElement => $<HTMLInputElement>('[data-action="show-disabled"]');

  it('hides them by default and says how many there are', () => {
    expect($$('[data-row]').map((r) => r.dataset.row)).toEqual(['0:0', '0:2']);
    expect(toggle().parentElement?.textContent).toBe('Show commented (2)');
    expect($('.hidden-hint').textContent).toBe('2 commented-out variables hidden');
    expect($('.count').textContent).toBe('2');
  });

  it('shows them, marked, with their real positions when toggled', () => {
    toggle().click();
    expect($$('[data-row]').map((r) => r.dataset.row)).toEqual(['0:0', '0:1', '0:2', '0:3']);
    expect(row(0, 1).classList.contains('disabled')).toBe(true);
    expect($('.badge-disabled', row(0, 1)).textContent).toBe('commented');
    expect(root.querySelector('.hidden-hint')).toBeNull();
    expect(root.querySelector('.badge-duplicate')).toBeNull();
  });

  it('comments out and uncomments with one click', () => {
    $('[data-action="toggle-disabled"]', row(0, 0)).click();
    app.receive({ type: 'update', version: 3, doc: WITH_DISABLED }); // the edit queue sends one edit per version
    toggle().click();
    $('[data-action="toggle-disabled"]', row(0, 1)).click();
    expect(edits()).toEqual([
      { type: 'updateVariable', ref: { group: 0, index: 0 }, changes: { disabled: true } },
      { type: 'updateVariable', ref: { group: 0, index: 1 }, changes: { disabled: false } },
    ]);
  });

  it('Alt+Down skips hidden rows', () => {
    key(row(0, 0), 'ArrowDown', { altKey: true });
    expect(edits()).toEqual([{ type: 'moveVariable', ref: { group: 0, index: 0 }, toGroup: 0, toIndex: 2 }]);
  });

  it('disables the toggle when the file has no commented-out variables', () => {
    app.receive({ type: 'update', version: 3, doc: DOC });
    expect(toggle().disabled).toBe(true);
  });
});
