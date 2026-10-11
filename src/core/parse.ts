import type { EnvDocument, EnvEntry, EnvGroup, EnvItem, Quote } from './model';

const HEADER_RE = /^\s*#\s*===\s*(.+?)\s*===\s*$/;
const ENTRY_RE = /^\s*(export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/;
const QUOTES = new Set(['"', "'", '`']);

export function isHeaderLine(line: string): boolean {
  return HEADER_RE.test(line);
}

function isCommentLine(line: string): boolean {
  return line.trimStart().startsWith('#');
}

function stripInlineComment(text: string): string {
  return text.replace(/^ /, '');
}

/** Index of the closing quote in `text` starting at `from`, honouring backslash escapes. */
function findClosingQuote(text: string, quote: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '\\') {
      i++;
    } else if (text[i] === quote) {
      return i;
    }
  }
  return -1;
}

interface EntryMatch {
  entry: EnvEntry;
  /** Number of source lines consumed. */
  lineCount: number;
}

function parseUnquoted(exported: boolean, key: string, rest: string, raw: string): EntryMatch {
  const hash = rest.indexOf('#');
  const entry: EnvEntry = {
    type: 'entry',
    key,
    value: (hash < 0 ? rest : rest.slice(0, hash)).trim(),
    quote: '',
    exported,
    comment: [],
    raw,
  };
  if (hash >= 0) {
    entry.inlineComment = stripInlineComment(rest.slice(hash + 1));
  }
  return { entry, lineCount: 1 };
}

function parseEntry(lines: string[], index: number, eol: string): EntryMatch | undefined {
  const match = ENTRY_RE.exec(lines[index]);
  if (!match) {
    return undefined;
  }
  const exported = match[1] !== undefined;
  const key = match[2];
  const rest = match[3];
  const quote = rest[0];

  if (!QUOTES.has(quote)) {
    return parseUnquoted(exported, key, rest, lines[index]);
  }

  // Quoted value, possibly spanning several lines.
  let text = rest;
  let lineCount = 1;
  let close = findClosingQuote(text, quote, 1);
  while (close < 0 && index + lineCount < lines.length) {
    text += '\n' + lines[index + lineCount];
    lineCount++;
    close = findClosingQuote(text, quote, 1);
  }
  if (close < 0) {
    return undefined;
  }

  const tail = /^\s*(?:#(.*))?$/.exec(text.slice(close + 1));
  if (!tail) {
    // Junk after the closing quote: fall back to dotenv's unquoted reading of the first line.
    return lineCount === 1 ? parseUnquoted(exported, key, rest, lines[index]) : undefined;
  }

  const entry: EnvEntry = {
    type: 'entry',
    key,
    value: text.slice(1, close),
    quote: quote as Quote,
    exported,
    comment: [],
    raw: lines.slice(index, index + lineCount).join(eol),
  };
  if (tail[1] !== undefined) {
    entry.inlineComment = stripInlineComment(tail[1]);
  }
  return { entry, lineCount };
}

export function parse(source: string): EnvDocument {
  const bom = source.startsWith('\uFEFF');
  const text = bom ? source.slice(1) : source;
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const finalNewline = text.endsWith('\n');
  const body = finalNewline ? text.replace(/\r?\n$/, '') : text;
  const lines = body === '' ? (finalNewline ? [''] : []) : body.split(/\r?\n/);

  const groups: EnvGroup[] = [{ name: null, comment: [], items: [] }];
  let group = groups[0];
  let pending: string[] = [];

  const flushPending = (): void => {
    if (pending.length > 0) {
      group.items.push({ type: 'comment', lines: pending });
      pending = [];
    }
  };
  const push = (item: EnvItem): void => {
    group.items.push(item);
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const header = HEADER_RE.exec(line);

    if (header) {
      flushPending();
      group = { name: header[1], header: line, comment: [], items: [] };
      groups.push(group);
      i++;
      while (i < lines.length && isCommentLine(lines[i]) && !isHeaderLine(lines[i])) {
        group.comment.push(lines[i]);
        i++;
      }
      continue;
    }

    if (isCommentLine(line)) {
      pending.push(line);
      i++;
      continue;
    }

    if (line.trim() === '') {
      flushPending();
      push(line === '' ? { type: 'blank' } : { type: 'blank', raw: line });
      i++;
      continue;
    }

    const parsed = parseEntry(lines, i, eol);
    if (parsed) {
      parsed.entry.comment = pending;
      parsed.entry.line = i;
      pending = [];
      push(parsed.entry);
      i += parsed.lineCount;
      continue;
    }

    flushPending();
    push({ type: 'unknown', raw: line });
    i++;
  }
  flushPending();

  return { groups, eol, finalNewline, bom };
}
