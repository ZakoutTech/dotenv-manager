/**
 * In-memory model of a .env file.
 *
 * Fidelity rule: nodes produced by the parser carry their original source text
 * (`raw` on entries, `header` on groups, raw `#` lines in comment arrays), and
 * the serializer writes that text back verbatim. Any edit that changes a field
 * must drop the matching raw text (`raw: undefined`, `header: undefined`) so
 * the node is re-formatted from its fields. Untouched nodes round-trip exactly.
 */

export type Quote = '"' | "'" | '`' | '';

export interface EnvEntry {
  type: 'entry';
  key: string;
  /** Text between the quotes (escape sequences are kept as written), or the trimmed unquoted value. */
  value: string;
  quote: Quote;
  exported: boolean;
  /** Raw `#` lines directly above the entry. */
  comment: string[];
  /** Text after `#` on the same line, without the leading space. */
  inlineComment?: string;
  /** Original source text (may span several lines for multiline values). */
  raw?: string;
}

/** Comment lines not attached to a variable (followed by a blank or unknown line). */
export interface EnvCommentBlock {
  type: 'comment';
  lines: string[];
}

export interface EnvBlank {
  type: 'blank';
  /** Original text when the line held only whitespace. */
  raw?: string;
}

/** A line the parser does not understand; kept verbatim. */
export interface EnvUnknown {
  type: 'unknown';
  raw: string;
}

export type EnvItem = EnvEntry | EnvCommentBlock | EnvBlank | EnvUnknown;

export interface EnvGroup {
  /** `null` for the implicit group of variables before the first header. */
  name: string | null;
  /** Original header line, e.g. `# === Database ===`. */
  header?: string;
  /** Raw `#` lines directly below the header. Always empty for the implicit group. */
  comment: string[];
  items: EnvItem[];
}

export interface EnvDocument {
  /** `groups[0]` is always the implicit (unnamed) group. */
  groups: EnvGroup[];
  eol: '\n' | '\r\n';
  finalNewline: boolean;
  bom: boolean;
}
