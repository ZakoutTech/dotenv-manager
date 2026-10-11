/** `${` autocompletion for value editors. */

export interface CompletionContext {
  /** Partial name typed after `${`. */
  prefix: string;
  /** Offset where the name starts (right after `${`). */
  start: number;
}

const MAX_SUGGESTIONS = 20;

export function completionContext(text: string, caret: number): CompletionContext | null {
  const match = /\$\{([A-Za-z0-9_.]*)$/.exec(text.slice(0, caret));
  if (!match) {
    return null;
  }
  const dollar = caret - match[0].length;
  if (dollar > 0 && text[dollar - 1] === '\\') {
    return null;
  }
  return { prefix: match[1], start: caret - match[1].length };
}

export function suggest(keys: string[], prefix: string, exclude?: string): string[] {
  const lower = prefix.toLowerCase();
  const out: string[] = [];
  for (const key of keys) {
    if (key !== exclude && !out.includes(key) && key.toLowerCase().startsWith(lower)) {
      out.push(key);
    }
  }
  return out.slice(0, MAX_SUGGESTIONS);
}

export function applyCompletion(text: string, caret: number, ctx: CompletionContext, name: string): { text: string; caret: number } {
  const rest = text.slice(caret);
  const consumed = (/^[A-Za-z0-9_.]*\}?/.exec(rest) as RegExpExecArray)[0].length;
  return { text: text.slice(0, ctx.start) + name + '}' + rest.slice(consumed), caret: ctx.start + name.length + 1 };
}

let listCounter = 0;

/**
 * Show a suggestion list below `field` while the caret follows `${`. Must be attached
 * before other keydown listeners: while the list is open it owns ↑/↓/Enter/Tab/Escape.
 */
export function attachCompletion(field: HTMLInputElement | HTMLTextAreaElement, keys: string[], exclude?: string): void {
  const listId = `completions-${++listCounter}`;
  let list: HTMLUListElement | null = null;
  let items: string[] = [];
  let active = 0;
  let ctx: CompletionContext | null = null;

  field.setAttribute('aria-autocomplete', 'list');
  field.setAttribute('aria-expanded', 'false');

  const caret = (): number => field.selectionStart ?? field.value.length;

  const close = (): void => {
    list?.remove();
    list = null;
    items = [];
    field.setAttribute('aria-expanded', 'false');
    field.removeAttribute('aria-activedescendant');
  };

  const accept = (name: string): void => {
    if (!ctx) {
      return;
    }
    const result = applyCompletion(field.value, caret(), ctx, name);
    close();
    field.value = result.text;
    field.setSelectionRange(result.caret, result.caret);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const renderList = (): void => {
    if (!list) {
      list = document.createElement('ul');
      list.className = 'completions';
      list.id = listId;
      list.setAttribute('role', 'listbox');
      field.setAttribute('aria-controls', listId);
      field.insertAdjacentElement('afterend', list);
    }
    list.replaceChildren(
      ...items.map((name, i) => {
        const option = document.createElement('li');
        option.id = `${listId}-${i}`;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(i === active));
        option.textContent = name;
        option.addEventListener('mousedown', (event) => {
          event.preventDefault();
          accept(name);
        });
        return option;
      }),
    );
    list.style.left = `${field.offsetLeft}px`;
    list.style.top = `${field.offsetTop + field.offsetHeight}px`;
    field.setAttribute('aria-expanded', 'true');
    field.setAttribute('aria-activedescendant', `${listId}-${active}`);
  };

  field.addEventListener('keydown', (event) => {
    if (!list) {
      return;
    }
    const { key } = event as KeyboardEvent;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      active = (active + (key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      renderList();
    } else if (key === 'Enter' || key === 'Tab') {
      accept(items[active]);
    } else if (key === 'Escape') {
      close();
    } else {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  });

  field.addEventListener('input', () => {
    ctx = completionContext(field.value, caret());
    const next = ctx ? suggest(keys, ctx.prefix, exclude) : [];
    if (next.join('\n') !== items.join('\n')) {
      active = 0;
    }
    items = next;
    if (items.length === 0) {
      close();
    } else {
      renderList();
    }
  });

  field.addEventListener('blur', close);
}
