import type { EnvDocument, EnvEntry, EnvGroup, Quote } from './model';

const NEEDS_QUOTES_RE = /[\s#"'`]/;

/** Plain text of a comment block: strips `#` and one following space from each line. */
export function commentText(lines: string[]): string {
  return lines.map((line) => line.trimStart().replace(/^# ?/, '')).join('\n');
}

/** Comment lines for plain text; empty text means no comment. */
export function toCommentLines(text: string): string[] {
  if (text === '') {
    return [];
  }
  return text.split(/\r?\n/).map((line) => (line === '' ? '#' : `# ${line}`));
}

export function formatGroupHeader(name: string): string {
  return `# === ${name} ===`;
}

function chooseQuote(value: string): Exclude<Quote, ''> {
  if (!value.includes('"')) {
    return '"';
  }
  return value.includes("'") ? '"' : "'";
}

/** Escape occurrences of `quote` that are not already escaped. */
function escapeQuote(value: string, quote: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '\\' && i + 1 < value.length) {
      out += value[i] + value[i + 1];
      i++;
    } else {
      out += value[i] === quote ? `\\${quote}` : value[i];
    }
  }
  return out;
}

/** One entry line (multiline values contain `\n`). Ignores `raw`. */
export function formatEntry(entry: EnvEntry): string {
  let quote = entry.quote;
  if (quote === '' && NEEDS_QUOTES_RE.test(entry.value)) {
    quote = chooseQuote(entry.value);
  }
  const value = quote === '' ? entry.value : `${quote}${escapeQuote(entry.value, quote)}${quote}`;
  const inline = entry.inlineComment !== undefined ? ` # ${entry.inlineComment}` : '';
  return `${entry.disabled ? '# ' : ''}${entry.exported ? 'export ' : ''}${entry.key}=${value}${inline}`;
}

function serializeGroup(group: EnvGroup, eol: string, out: string[]): void {
  if (group.name !== null) {
    out.push(group.header ?? formatGroupHeader(group.name));
    out.push(...group.comment);
  }
  for (const item of group.items) {
    switch (item.type) {
      case 'entry':
        out.push(...item.comment);
        out.push(item.raw ?? formatEntry(item).replace(/\n/g, eol));
        break;
      case 'comment':
        out.push(...item.lines);
        break;
      case 'blank':
        out.push(item.raw ?? '');
        break;
      case 'unknown':
        out.push(item.raw);
        break;
    }
  }
}

export function serialize(doc: EnvDocument): string {
  const out: string[] = [];
  for (const group of doc.groups) {
    serializeGroup(group, doc.eol, out);
  }
  const text = out.join(doc.eol) + (doc.finalNewline ? doc.eol : '');
  return doc.bom ? `\uFEFF${text}` : text;
}
