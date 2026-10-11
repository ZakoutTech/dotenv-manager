/**
 * Line tokenizer for the read-only .env text preview. It only needs to be good enough
 * to color the text and to know which characters are values (so they can be masked);
 * the real parser lives in core/parse.
 */

export type TokenKind = 'header' | 'comment' | 'key' | 'value' | 'punct' | 'text';

export interface Token {
  kind: TokenKind;
  text: string;
}

export interface PreviewLine {
  tokens: Token[];
  /** A commented-out variable (`# KEY=value`). */
  disabled?: boolean;
}

const HEADER_RE = /^\s*#\s*===\s*.+?\s*===\s*$/;
const DISABLED_RE = /^(\s*#\s*)((?:export\s+)?[A-Za-z_][A-Za-z0-9_.-]*=.*)$/;
const ENTRY_RE = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_.-]*)(\s*=\s*)(.*)$/;
const QUOTES = new Set(['"', "'", '`']);

/** Index of the closing `quote` at or after `from`, honouring backslash escapes; -1 if none. */
function closingQuote(text: string, quote: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '\\') {
      i++;
    } else if (text[i] === quote) {
      return i;
    }
  }
  return -1;
}

/** Split `rest` (everything after `=`) into value and trailing inline comment; `open` is set for an unclosed quote. */
function splitValue(rest: string): { value: string; tail: string; open?: string } {
  const quote = rest[0];
  if (QUOTES.has(quote)) {
    const close = closingQuote(rest, quote, 1);
    return close < 0 ? { value: rest, tail: '', open: quote } : { value: rest.slice(0, close + 1), tail: rest.slice(close + 1) };
  }
  const hash = rest.search(/\s#/);
  return hash < 0 ? { value: rest, tail: '' } : { value: rest.slice(0, hash), tail: rest.slice(hash) };
}

/** Tokens of a `KEY=value` line, plus the quote left open by a multiline value. */
function entryTokens(line: string): { tokens: Token[]; open?: string } | undefined {
  const entry = ENTRY_RE.exec(line);
  if (!entry) {
    return undefined;
  }
  const [, prefix, key, eq, rest] = entry;
  const split = splitValue(rest);
  const tokens: Token[] = [];
  if (prefix) {
    tokens.push({ kind: 'punct', text: prefix });
  }
  tokens.push({ kind: 'key', text: key }, { kind: 'punct', text: eq });
  if (split.value) {
    tokens.push({ kind: 'value', text: split.value });
  }
  if (split.tail) {
    tokens.push({ kind: 'comment', text: split.tail });
  }
  return { tokens, open: split.open };
}

export function tokenizeEnv(text: string): PreviewLine[] {
  const body = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const lines = body === '' ? [] : body.replace(/\n$/, '').split('\n');
  const out: PreviewLine[] = [];
  /** Quote of a multiline value still open from a previous line. */
  let open: string | undefined;

  for (const line of lines) {
    if (open) {
      const close = closingQuote(line, open, 0);
      if (close < 0) {
        out.push({ tokens: [{ kind: 'value', text: line }] });
        continue;
      }
      open = undefined;
      const tokens: Token[] = [{ kind: 'value', text: line.slice(0, close + 1) }];
      if (close + 1 < line.length) {
        tokens.push({ kind: 'comment', text: line.slice(close + 1) });
      }
      out.push({ tokens });
      continue;
    }
    if (HEADER_RE.test(line)) {
      out.push({ tokens: [{ kind: 'header', text: line }] });
      continue;
    }
    const disabled = DISABLED_RE.exec(line);
    const inner = disabled ? entryTokens(disabled[2]) : undefined;
    if (disabled && inner && !inner.open) {
      out.push({ tokens: [{ kind: 'punct', text: disabled[1] }, ...inner.tokens], disabled: true });
      continue;
    }
    if (line.trimStart().startsWith('#')) {
      out.push({ tokens: [{ kind: 'comment', text: line }] });
      continue;
    }
    const entry = entryTokens(line);
    if (entry) {
      open = entry.open;
      out.push({ tokens: entry.tokens });
      continue;
    }
    out.push({ tokens: line === '' ? [] : [{ kind: 'text', text: line }] });
  }
  return out;
}
