import type { EnvDocument, EnvEntry } from './model';

/**
 * dotenv-expand compatible reference resolution, scoped to the variables of one
 * file (process.env is deliberately not consulted: the GUI shows what the file says).
 *
 * Supported: `${VAR}`, `$VAR`, `${VAR:-default}` (unset or empty), `${VAR-default}`
 * (unset only), references inside defaults, and `\$` for a literal `$`.
 * Single-quoted values are never expanded.
 */

export interface ResolveDiagnostic {
  kind: 'undefined' | 'cycle';
  /** The variable whose value contains the problem. */
  key: string;
  /** The referenced variable. */
  ref: string;
  message: string;
}

export interface Resolution {
  value: string;
  /** Names referenced directly by the raw value, in order of appearance. */
  references: string[];
  diagnostics: ResolveDiagnostic[];
}

export interface ReferenceSpan {
  name: string;
  /** Offsets into the raw value; `end` is exclusive. */
  start: number;
  end: number;
}

type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'ref'; name: string; start: number; end: number; op?: ':-' | '-'; fallback?: Segment[] };

const BRACED_NAME_RE = /^[A-Za-z_][A-Za-z0-9_.]*/;
const BARE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*/;

/** Index of the `}` closing a default that starts at `from`, honouring nested `${…}` and escapes. */
function findDefaultEnd(s: string, from: number): number {
  let depth = 0;
  for (let i = from; i < s.length; i++) {
    if (s[i] === '\\') {
      i++;
    } else if (s.startsWith('${', i)) {
      depth++;
      i++;
    } else if (s[i] === '}') {
      if (depth === 0) {
        return i;
      }
      depth--;
    }
  }
  return -1;
}

/** Parse `${NAME…}` at `i` (pointing at `$`). Returns the segment and the index after it. */
function parseBraced(s: string, i: number, offset: number): [Segment, number] | undefined {
  const name = BRACED_NAME_RE.exec(s.slice(i + 2))?.[0];
  if (!name) {
    return undefined;
  }
  const after = i + 2 + name.length;
  if (s[after] === '}') {
    return [{ kind: 'ref', name, start: offset + i, end: offset + after + 1 }, after + 1];
  }
  const op = s.startsWith(':-', after) ? ':-' : s[after] === '-' ? '-' : undefined;
  if (!op) {
    return undefined;
  }
  const from = after + op.length;
  const close = findDefaultEnd(s, from);
  if (close < 0) {
    return undefined;
  }
  const fallback = parseTemplate(s.slice(from, close), offset + from);
  return [{ kind: 'ref', name, start: offset + i, end: offset + close + 1, op, fallback }, close + 1];
}

function parseTemplate(s: string, offset = 0): Segment[] {
  const segments: Segment[] = [];
  let text = '';
  const flush = (): void => {
    if (text) {
      segments.push({ kind: 'text', text });
      text = '';
    }
  };

  let i = 0;
  while (i < s.length) {
    if (s[i] === '\\' && s[i + 1] === '$') {
      text += '$';
      i += 2;
      continue;
    }
    if (s[i] === '$') {
      if (s[i + 1] === '{') {
        const braced = parseBraced(s, i, offset);
        if (braced) {
          flush();
          segments.push(braced[0]);
          i = braced[1];
          continue;
        }
      } else {
        const name = BARE_NAME_RE.exec(s.slice(i + 1))?.[0];
        if (name) {
          flush();
          segments.push({ kind: 'ref', name, start: offset + i, end: offset + i + 1 + name.length });
          i += 1 + name.length;
          continue;
        }
      }
    }
    text += s[i];
    i++;
  }
  flush();
  return segments;
}

function collectSpans(segments: Segment[], out: ReferenceSpan[]): ReferenceSpan[] {
  for (const seg of segments) {
    if (seg.kind === 'ref') {
      out.push({ name: seg.name, start: seg.start, end: seg.end });
      if (seg.fallback) {
        collectSpans(seg.fallback, out);
      }
    }
  }
  return out;
}

/** All references in a raw value (outer reference before the ones in its default). */
export function findReferences(value: string): ReferenceSpan[] {
  return collectSpans(parseTemplate(value), []);
}

const BARE_SAFE_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Rewrite references to `from` so they point at `to` (escaped `\$` and other names are untouched). */
export function renameReferences(value: string, from: string, to: string): string {
  const spans = findReferences(value)
    .filter((span) => span.name === from)
    .sort((a, b) => b.start - a.start);
  let out = value;
  for (const span of spans) {
    if (out[span.start + 1] === '{') {
      const at = span.start + 2;
      out = out.slice(0, at) + to + out.slice(at + from.length);
    } else {
      out = out.slice(0, span.start) + (BARE_SAFE_RE.test(to) ? `$${to}` : `\${${to}}`) + out.slice(span.end);
    }
  }
  return out;
}

export function isExpandable(entry: EnvEntry): boolean {
  return entry.quote !== "'";
}

function allEntries(doc: EnvDocument): EnvEntry[] {
  return doc.groups.flatMap((group) => group.items.filter((item): item is EnvEntry => item.type === 'entry'));
}

interface Resolver {
  /** Resolution of each key's effective (last) definition. */
  byKey: Map<string, Resolution>;
  /** Resolution of one specific entry (earlier duplicates included). */
  resolveEntry(entry: EnvEntry): Resolution;
}

function createResolver(doc: EnvDocument): Resolver {
  const defined = new Map<string, EnvEntry>();
  for (const entry of allEntries(doc)) {
    defined.set(entry.key, entry);
  }

  const byKey = new Map<string, Resolution>();
  const visiting: string[] = [];
  const cycles = new Map<string, string[]>();

  const resolveKey = (key: string): string => {
    const done = byKey.get(key);
    if (done) {
      return done.value;
    }
    const at = visiting.indexOf(key);
    if (at >= 0) {
      const loop = visiting.slice(at);
      loop.forEach((member, idx) => {
        if (!cycles.has(member)) {
          cycles.set(member, [...loop.slice(idx), ...loop.slice(0, idx), member]);
        }
      });
      return '';
    }
    const resolution = expand(defined.get(key) as EnvEntry);
    byKey.set(key, resolution);
    return resolution.value;
  };

  function expand(entry: EnvEntry): Resolution {
    const { key } = entry;
    if (!isExpandable(entry)) {
      return { value: entry.value, references: [], diagnostics: [] };
    }
    const diagnostics: ResolveDiagnostic[] = [];
    const segments = parseTemplate(entry.value);

    const render = (segs: Segment[]): string =>
      segs
        .map((seg) => {
          if (seg.kind === 'text') {
            return seg.text;
          }
          const isDefined = defined.has(seg.name);
          const current = isDefined ? resolveKey(seg.name) : undefined;
          if (seg.op === ':-' && !current) {
            return render(seg.fallback ?? []);
          }
          if (seg.op === '-' && !isDefined) {
            return render(seg.fallback ?? []);
          }
          if (!isDefined) {
            diagnostics.push({ kind: 'undefined', key, ref: seg.name, message: `Undefined variable ${seg.name}` });
          }
          return current ?? '';
        })
        .join('');

    visiting.push(key);
    const value = render(segments);
    visiting.pop();
    return { value, references: collectSpans(segments, []).map((s) => s.name), diagnostics };
  }

  for (const key of defined.keys()) {
    resolveKey(key);
  }
  for (const [key, path] of cycles) {
    byKey.get(key)?.diagnostics.push({ kind: 'cycle', key, ref: path[1], message: `Reference cycle: ${path.join(' → ')}` });
  }

  return {
    byKey,
    resolveEntry: (entry) => (defined.get(entry.key) === entry ? (byKey.get(entry.key) as Resolution) : expand(entry)),
  };
}

/** Resolution of every key, using the last definition of duplicate keys (like dotenv). */
export function resolve(doc: EnvDocument): Map<string, Resolution> {
  return createResolver(doc).byKey;
}

/** Resolution of every entry, including earlier definitions of duplicate keys. */
export function resolveEntries(doc: EnvDocument): Map<EnvEntry, Resolution> {
  const resolver = createResolver(doc);
  return new Map(allEntries(doc).map((entry) => [entry, resolver.resolveEntry(entry)]));
}
