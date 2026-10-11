import type {
  EditIntent,
  FromWebviewMessage,
  ToWebviewMessage,
  ViewDocument,
  ViewEntry,
  ViewGroup,
} from '../shared/protocol';
import type { DefaultView } from '../shared/associations';
import { groupNameError, keyError } from '../shared/validation';
import { groupDrop, keyboardGroupMove, variableDrop } from './dnd';
import type { VariableMove, VariablePosition } from './dnd';
import { attachCompletion } from './completion';
import { EditQueue } from './editQueue';
import { tokenizeEnv } from './textPreview';

type FieldKind = 'key' | 'value' | 'comment';

type Editing =
  | { kind: FieldKind | 'renameRefs'; group: number; index: number }
  | { kind: 'groupName' | 'groupComment' | 'deleteGroup' | 'newVariable'; group: number }
  | { kind: 'newGroup' };

interface State {
  version?: number;
  doc?: ViewDocument;
  collapsed: Set<number>;
  revealAll: boolean;
  revealed: Set<string>;
  /** Show commented-out variables (`# KEY=value`). */
  showDisabled: boolean;
  /** Show the .env text in a pane to the right. */
  showPreview: boolean;
  /** Current document text (for the preview pane). */
  text?: string;
  /** The document has unsaved changes. */
  dirty: boolean;
  editing?: Editing;
  /** In-progress text of the open editor(s), keyed by field name (`text` for single-field editors). */
  draft: Record<string, string>;
  fieldError?: string;
  error?: string;
  drag?: { kind: 'variable'; group: number; index: number } | { kind: 'group'; group: number };
  /** Focus target for the render that follows the next document update (keyboard moves). */
  focusNext?: string;
  /** Editor that opens .env files by default (unknown until the extension says). */
  defaultView?: DefaultView;
}

type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | boolean | undefined>;

const MASK = '••••••••';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === true) {
      el.setAttribute(name, '');
    } else if (typeof value === 'string') {
      el.setAttribute(name, value);
    }
  }
  for (const child of children) {
    if (child !== null && child !== undefined && child !== false) {
      el.append(child);
    }
  }
  return el;
}

function on<E extends HTMLElement>(el: E, type: string, handler: (event: Event) => void): E {
  el.addEventListener(type, handler);
  return el;
}

function button(label: string, action: string, focusId: string, extra: Attrs = {}): HTMLButtonElement {
  return h('button', { type: 'button', 'data-action': action, 'data-focus-id': focusId, ...extra }, label);
}

const rowId = (group: number, index: number): string => `${group}:${index}`;

export interface App {
  receive(message: ToWebviewMessage): void;
}

export function createApp(root: HTMLElement, post: (message: FromWebviewMessage) => void): App {
  const queue = new EditQueue(post);
  const state: State = { collapsed: new Set(), revealAll: false, revealed: new Set(), showDisabled: false, showPreview: false, dirty: false, draft: {} };
  let rendering = false;

  const dispatch = (intent: EditIntent): void => queue.submit(intent);

  const INDICATORS = ['drop-before', 'drop-after', 'drop-into', 'group-drop-before', 'group-drop-after'];
  const counts = (): number[] => state.doc?.groups.map((g) => g.entries.length) ?? [];
  const groupCount = (): number => state.doc?.groups.length ?? 0;

  function dropPosition(event: Event, el: HTMLElement): 'before' | 'after' {
    const rect = el.getBoundingClientRect();
    return (event as MouseEvent).clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  }

  function clearDropIndicators(): void {
    root.querySelectorAll(INDICATORS.map((c) => `.${c}`).join(',')).forEach((el) => el.classList.remove(...INDICATORS));
  }

  function endDrag(): void {
    state.drag = undefined;
    clearDropIndicators();
    root.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
  }

  function startDrag(event: Event, el: HTMLElement, drag: NonNullable<State['drag']>, label: string): void {
    event.stopPropagation();
    state.drag = drag;
    const transfer = (event as DragEvent).dataTransfer;
    if (transfer) {
      transfer.effectAllowed = 'move';
      transfer.setData('text/plain', label);
    }
    el.classList.add('dragging');
  }

  function moveVariable(from: VariablePosition, move: VariableMove | null): void {
    if (move) {
      dispatch({ type: 'moveVariable', ref: from, toGroup: move.toGroup, toIndex: move.toIndex });
      state.focusNext = `move-${rowId(move.toGroup, move.toIndex)}`;
    }
  }

  function moveGroup(from: number, to: number | null): void {
    if (to !== null) {
      dispatch({ type: 'moveGroup', group: from, toIndex: to });
      state.focusNext = `drag-group-${to}`;
    }
  }

  const isShown = (entry: ViewEntry): boolean => state.showDisabled || !entry.disabled;

  /** Model indices of the rows shown in group `g` (hidden commented-out variables are skipped). */
  const visibleIndices = (g: number): number[] =>
    groupAt(g)?.entries.flatMap((e, i) => (isShown(e) ? [i] : [])) ?? [];

  /** Alt+Up/Down: swap with the neighbouring *shown* row, or move to the end/start of the adjacent group. */
  function keyboardMove(source: VariablePosition, direction: 'up' | 'down'): VariableMove | null {
    const shown = visibleIndices(source.group);
    const neighbour = shown[shown.indexOf(source.index) + (direction === 'up' ? -1 : 1)];
    if (neighbour !== undefined) {
      return { toGroup: source.group, toIndex: neighbour };
    }
    if (direction === 'up') {
      return source.group > 0 ? { toGroup: source.group - 1, toIndex: counts()[source.group - 1] } : null;
    }
    return source.group < groupCount() - 1 ? { toGroup: source.group + 1, toIndex: 0 } : null;
  }

  /** Alt+ArrowUp / Alt+ArrowDown outside inline editors; returns the direction or undefined. */
  function moveKey(event: Event): 'up' | 'down' | undefined {
    const { key, altKey, target } = event as KeyboardEvent;
    if (!altKey || (key !== 'ArrowUp' && key !== 'ArrowDown') || (target as HTMLElement).classList.contains('inline-editor')) {
      return undefined;
    }
    event.preventDefault();
    return key === 'ArrowUp' ? 'up' : 'down';
  }

  const groupAt = (index: number): ViewGroup | undefined => state.doc?.groups[index];
  const entryAt = (group: number, index: number): ViewEntry | undefined => groupAt(group)?.entries[index];

  function startEditing(editing: Editing, draft: Record<string, string>): void {
    state.editing = editing;
    state.draft = { ...draft };
    state.fieldError = undefined;
    render();
  }

  function stopEditing(): void {
    state.editing = undefined;
    state.draft = {};
    state.fieldError = undefined;
    render();
  }

  function fail(message: string): void {
    state.fieldError = message;
    render();
  }

  function commit(): void {
    const editing = state.editing;
    if (!editing) {
      return;
    }
    const text = state.draft.text ?? '';

    switch (editing.kind) {
      case 'key':
      case 'value':
      case 'comment': {
        const entry = entryAt(editing.group, editing.index);
        if (!entry) {
          return stopEditing();
        }
        if (editing.kind === 'key') {
          const error = keyError(text);
          if (error) {
            return fail(error);
          }
          if (text !== entry.key && referencingCount(entry.key, editing.group, editing.index) > 0) {
            state.editing = { kind: 'renameRefs', group: editing.group, index: editing.index };
            state.fieldError = undefined;
            return render();
          }
        }
        if (text !== entry[editing.kind]) {
          dispatch({
            type: 'updateVariable',
            ref: { group: editing.group, index: editing.index },
            changes: { [editing.kind]: text },
          });
        }
        return stopEditing();
      }
      case 'groupName': {
        const error = groupNameError(text);
        if (error) {
          return fail(error);
        }
        if (text.trim() !== groupAt(editing.group)?.name) {
          dispatch({ type: 'renameGroup', group: editing.group, name: text.trim() });
        }
        return stopEditing();
      }
      case 'groupComment':
        if (text !== groupAt(editing.group)?.comment) {
          dispatch({ type: 'updateGroupComment', group: editing.group, comment: text });
        }
        return stopEditing();
      case 'newVariable': {
        const key = (state.draft.key ?? '').trim();
        const error = keyError(key);
        if (error) {
          return fail(error);
        }
        const intent: EditIntent = { type: 'addVariable', group: editing.group, key, value: state.draft.value ?? '' };
        if (state.draft.comment) {
          intent.comment = state.draft.comment;
        }
        dispatch(intent);
        return stopEditing();
      }
      case 'newGroup': {
        const name = state.draft.name ?? '';
        const error = groupNameError(name);
        if (error) {
          return fail(error);
        }
        const intent: EditIntent = { type: 'addGroup', name: name.trim() };
        if (state.draft.comment) {
          intent.comment = state.draft.comment;
        }
        dispatch(intent);
        return stopEditing();
      }
      case 'deleteGroup':
      case 'renameRefs':
        return stopEditing();
    }
  }

  /** Number of other variables whose value references `key`. */
  function referencingCount(key: string, group: number, index: number): number {
    let count = 0;
    state.doc?.groups.forEach((g, gi) =>
      g.entries.forEach((e, ei) => {
        if ((gi !== group || ei !== index) && e.references?.includes(key)) {
          count++;
        }
      }),
    );
    return count;
  }

  /** Keys dotenv loads (for `${` completion). */
  function allKeys(): string[] {
    return state.doc?.groups.flatMap((g) => g.entries.filter((e) => !e.disabled).map((e) => e.key)) ?? [];
  }

  /** Single-field inline editor: Enter saves, Shift+Enter adds a line (textarea), Escape cancels, blur saves. */
  function inlineEditor(
    multiline: boolean,
    label: string,
    completion?: { keys: string[]; exclude: string },
  ): HTMLInputElement | HTMLTextAreaElement {
    const editing = state.editing;
    const text = state.draft.text ?? '';
    const el = multiline ? h('textarea', { rows: String(Math.max(1, text.split('\n').length)) }) : h('input', { type: 'text' });
    el.className = 'inline-editor';
    el.value = text;
    el.setAttribute('aria-label', label);
    el.setAttribute('data-autofocus', '');
    if (state.fieldError) {
      el.setAttribute('aria-invalid', 'true');
    }
    if (completion) {
      // Registered first so an open suggestion list owns Enter/Escape/arrows.
      attachCompletion(el, completion.keys, completion.exclude);
    }
    on(el, 'input', () => {
      state.draft.text = el.value;
      if (el instanceof HTMLTextAreaElement) {
        el.rows = Math.max(1, el.value.split('\n').length);
      }
    });
    on(el, 'keydown', (event) => {
      const { key, shiftKey } = event as KeyboardEvent;
      if (key === 'Escape') {
        event.preventDefault();
        stopEditing();
      } else if (key === 'Enter' && !shiftKey) {
        event.preventDefault();
        commit();
      }
    });
    on(el, 'blur', () => {
      if (!rendering && state.editing === editing) {
        commit();
      }
    });
    return el;
  }

  function fieldError(): HTMLElement | null {
    return state.fieldError ? h('div', { class: 'field-error', role: 'alert' }, state.fieldError) : null;
  }

  function isEditing(kind: Editing['kind'], group?: number, index?: number): boolean {
    const e = state.editing;
    if (!e || e.kind !== kind) {
      return false;
    }
    if (group !== undefined && 'group' in e && e.group !== group) {
      return false;
    }
    return index === undefined || ('index' in e && e.index === index);
  }

  function duplicateKeys(doc: ViewDocument): Set<string> {
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const g of doc.groups) {
      for (const e of g.entries.filter((entry) => !entry.disabled)) {
        if (seen.has(e.key)) {
          dups.add(e.key);
        }
        seen.add(e.key);
      }
    }
    return dups;
  }

  function renderRow(entry: ViewEntry, g: number, i: number, duplicates: Set<string>): HTMLElement {
    const id = rowId(g, i);
    const revealed = state.revealAll || state.revealed.has(id);
    const editingRow =
      isEditing('key', g, i) || isEditing('value', g, i) || isEditing('comment', g, i) || isEditing('renameRefs', g, i);

    let comment: Child = null;
    if (isEditing('comment', g, i)) {
      comment = inlineEditor(true, `Comment for ${entry.key}`);
    } else if (entry.comment) {
      comment = on(h('div', { class: 'var-comment', title: 'Edit comment' }, entry.comment), 'click', () =>
        startEditing({ kind: 'comment', group: g, index: i }, { text: entry.comment }),
      );
    }

    const key = isEditing('key', g, i)
      ? inlineEditor(false, 'Variable name')
      : on(button(entry.key, 'edit-key', `key-${id}`, { class: 'key', title: 'Rename' }), 'click', () =>
          startEditing({ kind: 'key', group: g, index: i }, { text: entry.key }),
        );

    let value: HTMLElement;
    if (isEditing('value', g, i)) {
      value = inlineEditor(true, `Value of ${entry.key}`, { keys: allKeys(), exclude: entry.key });
    } else {
      const shown = entry.value === '' ? '(empty)' : revealed ? entry.value : MASK;
      value = on(
        button(shown, 'edit-value', `value-${id}`, {
          class: entry.value === '' ? 'value empty' : revealed ? 'value' : 'value masked',
          title: 'Edit value',
          'aria-label': revealed ? `Value of ${entry.key}: ${entry.value}` : `Value of ${entry.key} (hidden)`,
        }),
        'click',
        () => startEditing({ kind: 'value', group: g, index: i }, { text: entry.value }),
      );
    }

    const resolved =
      entry.references && !isEditing('value', g, i)
        ? h(
            'span',
            { class: 'resolved', title: revealed ? `Resolves to: ${entry.resolved ?? ''}` : 'Resolved value (hidden)' },
            `→\u00a0${revealed ? entry.resolved ?? '' : MASK}`,
          )
        : null;

    const warnings = entry.warnings?.length
      ? h('div', { class: 'warning', role: 'note' }, `⚠ ${entry.warnings.join('; ')}`)
      : null;

    let renamePrompt: Child = null;
    if (isEditing('renameRefs', g, i)) {
      const newKey = state.draft.text ?? '';
      const count = referencingCount(entry.key, g, i);
      const rename = (updateReferences: boolean): void => {
        dispatch({ type: 'renameVariable', ref: { group: g, index: i }, key: newKey, updateReferences });
        stopEditing();
      };
      renamePrompt = h(
        'div',
        { class: 'confirm', role: 'alert' },
        h('span', {}, `${count} variable${count === 1 ? '' : 's'} reference${count === 1 ? 's' : ''} ${entry.key}. Rename to ${newKey}:`),
        on(button('Rename and update references', 'rename-update', `rename-update-${id}`, { class: 'primary', 'data-autofocus': true }), 'click', () =>
          rename(true),
        ),
        on(button('Rename only', 'rename-only', `rename-only-${id}`), 'click', () => rename(false)),
        on(button('Cancel', 'cancel', `rename-cancel-${id}`), 'click', stopEditing),
      );
    }

    const reveal = on(
      button(revealed ? 'Hide' : 'Show', 'reveal', `reveal-${id}`, {
        class: 'icon',
        'aria-pressed': String(revealed),
        disabled: state.revealAll,
        title: revealed ? 'Hide value' : 'Show value',
      }),
      'click',
      () => {
        if (state.revealed.has(id)) {
          state.revealed.delete(id);
        } else {
          state.revealed.add(id);
        }
        render();
      },
    );

    const exportBox = h('input', {
      type: 'checkbox',
      'data-action': 'toggle-export',
      'data-focus-id': `export-${id}`,
      checked: entry.exported,
    });
    on(exportBox, 'change', () =>
      dispatch({ type: 'updateVariable', ref: { group: g, index: i }, changes: { exported: exportBox.checked } }),
    );

    const handle = button('⠿', 'move-variable', `move-${id}`, {
      class: 'icon drag-handle',
      'aria-label': `Move ${entry.key} (drag, or Alt+Up / Alt+Down)`,
      title: 'Drag to reorder, or Alt+Up / Alt+Down',
    });

    const li = h(
      'li',
      { class: entry.disabled ? 'row disabled' : 'row', 'data-row': id, draggable: editingRow ? 'false' : 'true' },
      comment,
      h(
        'div',
        { class: 'row-main' },
        handle,
        key,
        h('span', { class: 'eq', 'aria-hidden': 'true' }, '='),
        value,
        resolved,
        reveal,
        h('label', { class: 'export', title: 'Prefix with export' }, exportBox, 'export'),
        entry.disabled ? h('span', { class: 'badge-disabled', title: 'Commented out: dotenv ignores this line' }, 'commented') : null,
        !entry.disabled && duplicates.has(entry.key)
          ? h('span', { class: 'badge-duplicate', title: `${entry.key} is defined more than once; the last one wins` }, 'duplicate')
          : null,
        h(
          'span',
          { class: 'actions' },
          on(button('Comment', 'edit-comment', `comment-${id}`, { title: 'Edit comment' }), 'click', () =>
            startEditing({ kind: 'comment', group: g, index: i }, { text: entry.comment }),
          ),
          on(
            button(entry.disabled ? 'Uncomment' : 'Comment out', 'toggle-disabled', `disable-${id}`, {
              title: entry.disabled ? `Uncomment ${entry.key} so dotenv loads it` : `Comment out ${entry.key} (# ${entry.key}=…)`,
            }),
            'click',
            () => dispatch({ type: 'updateVariable', ref: { group: g, index: i }, changes: { disabled: !entry.disabled } }),
          ),
          on(button('Delete', 'delete-variable', `delete-${id}`, { class: 'danger', title: `Delete ${entry.key}` }), 'click', () =>
            dispatch({ type: 'deleteVariable', ref: { group: g, index: i } }),
          ),
        ),
      ),
      warnings,
      renamePrompt,
      editingRow ? fieldError() : null,
    );

    const source = { group: g, index: i };
    on(li, 'dragstart', (event) => startDrag(event, li, { kind: 'variable', ...source }, entry.key));
    on(li, 'dragend', endDrag);
    on(li, 'dragover', (event) => {
      if (state.drag?.kind !== 'variable') {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      clearDropIndicators();
      li.classList.add(dropPosition(event, li) === 'before' ? 'drop-before' : 'drop-after');
    });
    on(li, 'drop', (event) => {
      const drag = state.drag;
      if (drag?.kind !== 'variable') {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      endDrag();
      const from = { group: drag.group, index: drag.index };
      moveVariable(from, variableDrop(counts(), from, { ...source, position: dropPosition(event, li) }));
    });
    on(li, 'keydown', (event) => {
      const direction = moveKey(event);
      if (direction) {
        moveVariable(source, keyboardMove(source, direction));
      }
    });
    return li;
  }

  function formField(name: string, label: string, multiline: boolean, placeholder: string, autofocus = false): HTMLElement {
    const field = multiline ? h('textarea', { name, rows: '1', placeholder }) : h('input', { type: 'text', name, placeholder });
    field.value = state.draft[name] ?? '';
    if (autofocus) {
      field.setAttribute('data-autofocus', '');
    }
    on(field, 'input', () => {
      state.draft[name] = field.value;
    });
    return h('label', { class: 'form-field' }, h('span', {}, label), field);
  }

  function inlineForm(className: string, submitLabel: string, fields: HTMLElement[]): HTMLFormElement {
    const form = h(
      'form',
      { class: `inline-form ${className}` },
      ...fields,
      fieldError(),
      h(
        'div',
        { class: 'form-actions' },
        h('button', { type: 'submit', 'data-action': 'save', class: 'primary' }, submitLabel),
        on(button('Cancel', 'cancel', `cancel-${className}`), 'click', stopEditing),
      ),
    );
    on(form, 'submit', (event) => {
      event.preventDefault();
      commit();
    });
    on(form, 'keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Escape') {
        event.preventDefault();
        stopEditing();
      }
    });
    return form;
  }

  function renderGroup(group: ViewGroup, g: number, duplicates: Set<string>): HTMLElement {
    const named = group.name !== null;
    const expanded = !state.collapsed.has(g);
    const count = group.entries.length;
    const active = group.entries.filter((e) => !e.disabled).length;
    const hidden = group.entries.filter((e) => !isShown(e)).length;
    const label = group.name ?? 'Ungrouped';

    const toggle = on(
      button(expanded ? '▾' : '▸', 'toggle-group', `toggle-${g}`, {
        class: 'icon',
        'aria-expanded': String(expanded),
        'aria-label': `${expanded ? 'Collapse' : 'Expand'} ${label}`,
      }),
      'click',
      () => {
        if (expanded) {
          state.collapsed.add(g);
        } else {
          state.collapsed.delete(g);
        }
        render();
      },
    );

    let title: HTMLElement;
    if (isEditing('groupName', g)) {
      title = inlineEditor(false, 'Group name');
    } else if (named) {
      title = on(button(label, 'rename-group', `rename-${g}`, { class: 'group-title', title: 'Rename group' }), 'click', () =>
        startEditing({ kind: 'groupName', group: g }, { text: group.name ?? '' }),
      );
    } else {
      title = h('span', { class: 'group-title' }, label);
    }

    const actions = h(
      'span',
      { class: 'actions' },
      named
        ? on(button('Comment', 'edit-group-comment', `group-comment-${g}`, { title: 'Edit group comment' }), 'click', () =>
            startEditing({ kind: 'groupComment', group: g }, { text: group.comment }),
          )
        : null,
      named
        ? on(button('Delete', 'delete-group', `delete-group-${g}`, { class: 'danger', title: `Delete group ${label}` }), 'click', () =>
            startEditing({ kind: 'deleteGroup', group: g }, {}),
          )
        : null,
      on(
        button('Sort A→Z', 'sort-group', `sort-group-${g}`, {
          title: `Sort the variables of ${label} alphabetically`,
          disabled: count < 2,
        }),
        'click',
        () => dispatch({ type: 'sortGroup', group: g }),
      ),
      on(button('+ Variable', 'add-variable', `add-variable-${g}`, { title: `Add a variable to ${label}` }), 'click', () =>
        startEditing({ kind: 'newVariable', group: g }, {}),
      ),
    );

    let comment: Child = null;
    if (isEditing('groupComment', g)) {
      comment = h('div', { class: 'group-comment-editor' }, inlineEditor(true, `Comment for group ${label}`), fieldError());
    } else if (group.comment) {
      comment = on(h('p', { class: 'group-comment', title: 'Edit group comment' }, group.comment), 'click', () =>
        startEditing({ kind: 'groupComment', group: g }, { text: group.comment }),
      );
    }

    let confirm: Child = null;
    if (isEditing('deleteGroup', g)) {
      confirm = h(
        'div',
        { class: 'confirm', role: 'alert' },
        h('span', {}, `Delete group “${label}”?`),
        on(
          button(count > 0 ? `Delete group and ${count} variable${count === 1 ? '' : 's'}` : 'Delete group', 'confirm-delete-group', `confirm-delete-${g}`, {
            class: 'danger',
            'data-autofocus': true,
          }),
          'click',
          () => {
            dispatch({ type: 'deleteGroup', group: g, deleteVariables: true });
            stopEditing();
          },
        ),
        count > 0
          ? on(button('Delete group, keep variables', 'keep-variables', `keep-variables-${g}`), 'click', () => {
              dispatch({ type: 'deleteGroup', group: g, deleteVariables: false });
              stopEditing();
            })
          : null,
        on(button('Cancel', 'cancel', `cancel-delete-${g}`), 'click', stopEditing),
      );
    }

    const body: Child[] = [];
    if (expanded) {
      const rows = group.entries.flatMap((e, i) => (isShown(e) ? [renderRow(e, g, i, duplicates)] : []));
      body.push(
        rows.length > 0
          ? h('ul', { class: 'rows', role: 'list' }, ...rows)
          : h('p', { class: 'empty-hint' }, 'No variables in this group.'),
      );
      if (hidden > 0) {
        body.push(h('p', { class: 'hidden-hint' }, `${hidden} commented-out variable${hidden === 1 ? '' : 's'} hidden`));
      }
      if (isEditing('newVariable', g)) {
        body.push(
          inlineForm('new-variable', 'Add variable', [
            formField('key', 'Name', false, 'VARIABLE_NAME', true),
            formField('value', 'Value', true, 'value'),
            formField('comment', 'Comment', true, 'optional'),
          ]),
        );
      }
    }

    const header = h(
      'div',
      { class: 'group-header', draggable: named ? 'true' : undefined },
      named
        ? button('⠿', 'drag-group', `drag-group-${g}`, {
            class: 'icon drag-handle',
            'aria-label': `Move group ${label} (drag, or Alt+Up / Alt+Down)`,
            title: 'Drag to reorder groups, or Alt+Up / Alt+Down',
          })
        : null,
      toggle,
      title,
      h(
        'span',
        { class: 'count', title: count > active ? `${active} variables, ${count - active} commented out` : `${count} variables` },
        count > active && state.showDisabled ? `${active} + ${count - active}` : String(active),
      ),
      actions,
    );

    const section = h(
      'section',
      { class: named ? 'group' : 'group ungrouped', 'data-group': String(g), 'aria-label': label },
      header,
      isEditing('groupName', g) ? fieldError() : null,
      comment,
      confirm,
      ...body,
    );

    if (named) {
      on(header, 'dragstart', (event) => startDrag(event, section, { kind: 'group', group: g }, label));
      on(header, 'dragend', endDrag);
      on(header, 'keydown', (event) => {
        const direction = moveKey(event);
        if (direction) {
          moveGroup(g, keyboardGroupMove(groupCount(), g, direction));
        }
      });
    }
    on(section, 'dragover', (event) => {
      if (!state.drag) {
        return;
      }
      event.preventDefault();
      clearDropIndicators();
      if (state.drag.kind === 'variable') {
        section.classList.add('drop-into');
      } else {
        section.classList.add(dropPosition(event, section) === 'before' ? 'group-drop-before' : 'group-drop-after');
      }
    });
    on(section, 'drop', (event) => {
      const drag = state.drag;
      if (!drag) {
        return;
      }
      event.preventDefault();
      endDrag();
      if (drag.kind === 'variable') {
        const from = { group: drag.group, index: drag.index };
        moveVariable(from, variableDrop(counts(), from, { group: g, end: true }));
      } else {
        moveGroup(drag.group, groupDrop(groupCount(), drag.group, g, dropPosition(event, section)));
      }
    });
    return section;
  }

  function defaultViewPicker(current: DefaultView): HTMLElement {
    const select = h(
      'select',
      { 'data-action': 'default-view', 'data-focus-id': 'default-view', title: 'Editor used when you open a .env file' },
      h('option', { value: 'visual' }, 'Dotenv Manager'),
      h('option', { value: 'text' }, 'Text editor'),
    );
    select.value = current;
    on(select, 'change', () => {
      const view = select.value === 'text' ? 'text' : 'visual';
      state.defaultView = view;
      post({ type: 'setDefaultView', view });
    });
    return h('label', { class: 'default-view' }, 'Open .env files with', select);
  }

  /** Read-only, highlighted .env text; values follow the "Show values" mask. */
  function renderTextPreview(): HTMLElement {
    const lines = tokenizeEnv(state.text ?? '');
    const code = h(
      'pre',
      { class: 'text-preview-code', 'aria-label': '.env text' },
      ...lines.map((line, n) =>
        h(
          'div',
          { class: line.disabled ? 'line disabled' : 'line' },
          h('span', { class: 'ln', 'aria-hidden': 'true' }, String(n + 1)),
          h(
            'span',
            { class: 'code' },
            ...line.tokens.map((t) => h('span', { class: `tok-${t.kind}` }, t.kind === 'value' && !state.revealAll ? MASK : t.text)),
          ),
        ),
      ),
    );
    return h(
      'aside',
      { class: 'text-preview', 'aria-label': 'Preview of the .env file' },
      h(
        'div',
        { class: 'text-preview-title' },
        h('span', {}, 'Preview'),
        h('span', { class: 'text-preview-hint' }, state.revealAll ? 'read-only' : 'read-only · values hidden'),
      ),
      lines.length > 0 ? code : h('p', { class: 'empty-hint' }, 'The file is empty.'),
    );
  }

  function render(focusId?: string): void {
    rendering = true;
    const activeId = (document.activeElement as HTMLElement | null)?.dataset?.focusId;

    const children: Child[] = [];
    const revealAll = h('input', { type: 'checkbox', 'data-action': 'reveal-all', 'data-focus-id': 'reveal-all', checked: state.revealAll });
    on(revealAll, 'change', () => {
      state.revealAll = revealAll.checked;
      render();
    });
    const disabledCount = state.doc?.groups.reduce((n, g) => n + g.entries.filter((e) => e.disabled).length, 0) ?? 0;
    const showDisabled = h('input', {
      type: 'checkbox',
      'data-action': 'show-disabled',
      'data-focus-id': 'show-disabled',
      checked: state.showDisabled,
      disabled: disabledCount === 0 && !state.showDisabled,
    });
    on(showDisabled, 'change', () => {
      state.showDisabled = showDisabled.checked;
      render();
    });
    const showPreview = h('input', { type: 'checkbox', 'data-action': 'show-preview', 'data-focus-id': 'show-preview', checked: state.showPreview });
    on(showPreview, 'change', () => {
      state.showPreview = showPreview.checked;
      render();
    });
    children.push(
      h(
        'div',
        { class: 'toolbar', role: 'toolbar', 'aria-label': 'Dotenv Manager' },
        on(
          button('Save', 'save', 'save', {
            class: state.dirty ? 'primary' : undefined,
            disabled: !state.dirty,
            title: state.dirty ? 'Save the file (Ctrl/Cmd+S)' : 'No unsaved changes',
          }),
          'click',
          () => post({ type: 'save' }),
        ),
        on(button('+ Group', 'add-group', 'add-group', { class: 'primary' }), 'click', () => startEditing({ kind: 'newGroup' }, {})),
        on(button('Sort all A→Z', 'sort-all', 'sort-all', { title: 'Sort the variables of every group alphabetically' }), 'click', () =>
          dispatch({ type: 'sortAll' }),
        ),
        h('label', { class: 'show-preview', title: 'Show the .env text to the right' }, showPreview, 'Preview'),
        h('label', { class: 'reveal-all' }, revealAll, 'Show values'),
        h(
          'label',
          { class: 'show-disabled', title: 'Show variables that are commented out (# KEY=value)' },
          showDisabled,
          `Show commented (${disabledCount})`,
        ),
        h('span', { class: 'toolbar-spacer' }),
        state.defaultView ? defaultViewPicker(state.defaultView) : null,
        on(button('Open as text', 'open-as-text', 'open-as-text', { title: 'Show this file in the text editor' }), 'click', () =>
          post({ type: 'openAsText' }),
        ),
      ),
    );

    if (state.error) {
      children.push(
        h(
          'div',
          { class: 'error-banner', role: 'alert' },
          h('span', {}, state.error),
          on(button('×', 'dismiss-error', 'dismiss-error', { class: 'icon', 'aria-label': 'Dismiss error' }), 'click', () => {
            state.error = undefined;
            render();
          }),
        ),
      );
    }

    if (isEditing('newGroup')) {
      children.push(
        inlineForm('new-group', 'Add group', [
          formField('name', 'Group name', false, 'Database', true),
          formField('comment', 'Comment', true, 'optional'),
        ]),
      );
    }

    const doc = state.doc;
    if (doc) {
      const duplicates = duplicateKeys(doc);
      doc.groups.forEach((group, g) => {
        const showUngrouped = group.entries.length > 0 || doc.groups.length === 1 || isEditing('newVariable', 0);
        if (group.name !== null || showUngrouped) {
          children.push(renderGroup(group, g, duplicates));
        }
      });
    }

    const [toolbar, ...content] = children.filter((c): c is Node | string => !!c);
    root.replaceChildren(
      toolbar,
      ...(state.showPreview
        ? [h('div', { class: 'split' }, h('div', { class: 'split-main' }, ...content), renderTextPreview())]
        : content),
    );

    const wanted = focusId ?? activeId;
    const target =
      root.querySelector<HTMLElement>('[data-autofocus]') ??
      (wanted ? root.querySelector<HTMLElement>(`[data-focus-id="${wanted}"]`) : null);
    target?.focus();
    rendering = false;
  }

  /** Drop editing state that points at something the new document no longer has. */
  function reconcileEditing(): void {
    const e = state.editing;
    if (!e || e.kind === 'newGroup') {
      return;
    }
    const exists = 'index' in e ? !!entryAt(e.group, e.index) : !!groupAt(e.group);
    if (!exists) {
      state.editing = undefined;
      state.draft = {};
      state.fieldError = undefined;
    }
  }

  post({ type: 'ready' });

  return {
    receive(message: ToWebviewMessage): void {
      if (message.type === 'settings') {
        state.defaultView = message.defaultView;
        render();
        return;
      }
      if (message.type === 'dirty') {
        state.dirty = message.dirty;
        render();
        return;
      }
      if (message.type !== 'update') {
        state.error = message.message;
        queue.failed();
        render();
        return;
      }
      state.version = message.version;
      state.doc = message.doc;
      state.text = message.text ?? state.text;
      state.dirty = message.dirty ?? state.dirty;
      reconcileEditing();
      const focusId = state.focusNext;
      state.focusNext = undefined;
      render(focusId);
      queue.setVersion(message.version);
    },
  };
}
