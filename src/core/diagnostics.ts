import type { EnvEntry } from './model';
import { parse } from './parse';
import { findReferences, resolveEntries } from './resolve';

export interface EnvProblem {
  kind: 'undefined' | 'cycle';
  /** 0-based positions in the document text (BOM excluded, as VS Code reports them). */
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
  message: string;
}

interface Position {
  line: number;
  character: number;
}

/** Offset of the value's first character inside `entry.raw`. */
function valueOffset(entry: EnvEntry & { raw: string }): number {
  const eq = entry.raw.indexOf('=');
  return entry.quote ? entry.raw.indexOf(entry.quote, eq) + 1 : entry.raw.indexOf(entry.value, eq + 1);
}

/** Document position of `offset` within the entry's value (values store line breaks as `\n`). */
function positionAt(entry: EnvEntry & { raw: string; line: number }, valueStart: number, offset: number, eol: string): Position {
  const newlinesInValue = (entry.value.slice(0, offset).match(/\n/g) ?? []).length;
  const rawOffset = valueStart + offset + newlinesInValue * (eol.length - 1);
  const before = entry.raw.slice(0, rawOffset);
  return {
    line: entry.line + (before.match(/\n/g) ?? []).length,
    character: rawOffset - (before.lastIndexOf('\n') + 1),
  };
}

/** Undefined references and reference cycles, located at the offending `${…}` in the text. */
export function computeProblems(text: string): EnvProblem[] {
  const doc = parse(text);
  const problems: EnvProblem[] = [];

  for (const [entry, resolution] of resolveEntries(doc)) {
    if (resolution.diagnostics.length === 0 || entry.raw === undefined || entry.line === undefined) {
      continue;
    }
    const located = entry as EnvEntry & { raw: string; line: number };
    const spans = findReferences(entry.value);
    const used = new Set<number>();
    const start = valueOffset(located);

    for (const diagnostic of resolution.diagnostics) {
      const index = spans.findIndex((span, i) => span.name === diagnostic.ref && !used.has(i));
      let from: Position = { line: located.line, character: 0 };
      let to: Position = { line: located.line, character: start };
      if (index >= 0) {
        used.add(index);
        from = positionAt(located, start, spans[index].start, doc.eol);
        to = positionAt(located, start, spans[index].end, doc.eol);
      }
      problems.push({
        kind: diagnostic.kind,
        line: from.line,
        character: from.character,
        endLine: to.line,
        endCharacter: to.character,
        message: diagnostic.message,
      });
    }
  }
  return problems;
}
