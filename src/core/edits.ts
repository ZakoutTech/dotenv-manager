import type { EnvDocument, EnvEntry, EnvGroup } from './model';
import { isExpandable, renameReferences } from './resolve';
import { toCommentLines } from './serialize';
import type { EditIntent, EntryRef, VariableChanges } from '../shared/protocol';
import { groupNameError, keyError } from '../shared/validation';

/** An intent that cannot be applied (bad input or stale reference). Safe to show to the user. */
export class EditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditError';
  }
}

export function validateKey(key: string): void {
  const error = keyError(key);
  if (error) {
    throw new EditError(error);
  }
}

function validateGroupName(name: string): string {
  const error = groupNameError(name);
  if (error) {
    throw new EditError(error);
  }
  return name.trim();
}

function getGroup(doc: EnvDocument, index: number): EnvGroup {
  const group = doc.groups[index];
  if (!group) {
    throw new EditError(`Group ${index} does not exist.`);
  }
  return group;
}

function getNamedGroup(doc: EnvDocument, index: number): EnvGroup {
  if (index === 0) {
    throw new EditError('The ungrouped section cannot be renamed, commented, moved or deleted.');
  }
  return getGroup(doc, index);
}

/** Item indices of the entries in a group. */
function entryPositions(group: EnvGroup): number[] {
  return group.items.flatMap((item, i) => (item.type === 'entry' ? [i] : []));
}

function locateEntry(doc: EnvDocument, ref: EntryRef): { group: EnvGroup; itemIndex: number; entry: EnvEntry } {
  const group = getGroup(doc, ref.group);
  const itemIndex = entryPositions(group)[ref.index];
  if (itemIndex === undefined) {
    throw new EditError(`Variable ${ref.index} does not exist in group ${ref.group}.`);
  }
  return { group, itemIndex, entry: group.items[itemIndex] as EnvEntry };
}

/** Remove an item; if that leaves two blank lines touching (or a leading blank), drop one. */
function removeItem(group: EnvGroup, itemIndex: number): void {
  group.items.splice(itemIndex, 1);
  const prevIsBlank = itemIndex === 0 || group.items[itemIndex - 1].type === 'blank';
  if (prevIsBlank && group.items[itemIndex]?.type === 'blank') {
    group.items.splice(itemIndex, 1);
  }
}

/** Item index at which a variable must be inserted to become the `toIndex`-th variable. */
function insertionPoint(group: EnvGroup, toIndex: number): number {
  const positions = entryPositions(group);
  if (toIndex < 0 || toIndex > positions.length) {
    throw new EditError(`Position ${toIndex} is out of range.`);
  }
  if (toIndex < positions.length) {
    return positions[toIndex];
  }
  if (positions.length > 0) {
    return positions[positions.length - 1] + 1;
  }
  let p = group.items.length;
  while (p > 0 && group.items[p - 1].type === 'blank') {
    p--;
  }
  return p;
}

/**
 * Insert blank lines where the parser would otherwise re-attach comments to the
 * wrong owner: a free comment block directly above a variable, or comment lines
 * directly below a group header (which the parser reads as the group comment).
 * Parsed documents already satisfy this, so untouched files are not changed.
 */
function fixAdjacency(group: EnvGroup): void {
  const first = group.items[0];
  if (group.name !== null && first && ((first.type === 'entry' && first.comment.length > 0) || first.type === 'comment')) {
    group.items.unshift({ type: 'blank' });
  }
  for (let i = 1; i < group.items.length; i++) {
    if (group.items[i].type === 'entry' && group.items[i - 1].type === 'comment') {
      group.items.splice(i, 0, { type: 'blank' });
      i++;
    }
  }
}

function rendersContent(group: EnvGroup): boolean {
  return group.name !== null || group.items.length > 0;
}

/** Make sure the group at `index` is preceded by a blank line (when anything precedes it). */
function ensureSeparatorBefore(doc: EnvDocument, index: number): void {
  if (index < 1 || index >= doc.groups.length) {
    return;
  }
  const prev = doc.groups[index - 1];
  if (rendersContent(prev) && prev.items[prev.items.length - 1]?.type !== 'blank') {
    prev.items.push({ type: 'blank' });
  }
}

const sortKey = (entry: EnvEntry): string => entry.key.toLowerCase();

/**
 * Sort a group's variables A→Z (case-insensitive, stable). Variables are permuted
 * within the slots variables already occupy, so blank lines, free comment blocks
 * and unknown lines keep their positions; each variable keeps its comment and raw text.
 */
function sortGroup(group: EnvGroup): void {
  const slots = entryPositions(group);
  const sorted = slots
    .map((slot) => group.items[slot] as EnvEntry)
    .sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0));
  slots.forEach((slot, i) => {
    group.items[slot] = sorted[i];
  });
}

function newEntry(key: string, value: string, comment: string | undefined): EnvEntry {
  validateKey(key);
  return { type: 'entry', key, value, quote: '', exported: false, comment: toCommentLines(comment ?? '') };
}

function updateEntry(entry: EnvEntry, changes: VariableChanges): EnvEntry {
  const next: EnvEntry = { ...entry };
  let reformat = false;
  if (changes.key !== undefined) {
    validateKey(changes.key);
    next.key = changes.key;
    reformat = true;
  }
  if (changes.value !== undefined) {
    next.value = changes.value;
    reformat = true;
  }
  if (changes.quote !== undefined) {
    next.quote = changes.quote;
    reformat = true;
  }
  if (changes.exported !== undefined) {
    next.exported = changes.exported;
    reformat = true;
  }
  if (changes.inlineComment !== undefined) {
    if (changes.inlineComment === null) {
      delete next.inlineComment;
    } else {
      next.inlineComment = changes.inlineComment;
    }
    reformat = true;
  }
  if (changes.disabled !== undefined) {
    next.disabled = changes.disabled || undefined;
    reformat = true;
  }
  if (changes.comment !== undefined) {
    next.comment = toCommentLines(changes.comment);
  }
  if (next.disabled && next.value.includes('\n')) {
    throw new EditError(`${next.key} has a multiline value, which can't be commented out.`);
  }
  if (reformat) {
    delete next.raw;
  }
  return next;
}

/** Apply one intent and return a new document; the input is not modified. */
export function applyIntent(source: EnvDocument, intent: EditIntent): EnvDocument {
  const doc = structuredClone(source);

  switch (intent.type) {
    case 'addVariable': {
      const group = getGroup(doc, intent.group);
      const at = insertionPoint(group, intent.index ?? entryPositions(group).length);
      group.items.splice(at, 0, newEntry(intent.key, intent.value, intent.comment));
      break;
    }
    case 'updateVariable': {
      const { group, itemIndex, entry } = locateEntry(doc, intent.ref);
      group.items[itemIndex] = updateEntry(entry, intent.changes);
      break;
    }
    case 'renameVariable': {
      const { group, itemIndex, entry } = locateEntry(doc, intent.ref);
      group.items[itemIndex] = updateEntry(entry, { key: intent.key });
      if (intent.updateReferences && intent.key !== entry.key) {
        for (const g of doc.groups) {
          g.items.forEach((item, i) => {
            if (item.type === 'entry' && isExpandable(item)) {
              const value = renameReferences(item.value, entry.key, intent.key);
              if (value !== item.value) {
                g.items[i] = updateEntry(item, { value });
              }
            }
          });
        }
      }
      break;
    }
    case 'deleteVariable': {
      const { group, itemIndex } = locateEntry(doc, intent.ref);
      removeItem(group, itemIndex);
      break;
    }
    case 'moveVariable': {
      const target = getGroup(doc, intent.toGroup);
      const { group, itemIndex, entry } = locateEntry(doc, intent.ref);
      removeItem(group, itemIndex);
      target.items.splice(insertionPoint(target, intent.toIndex), 0, entry);
      break;
    }
    case 'addGroup': {
      doc.groups.push({ name: validateGroupName(intent.name), comment: toCommentLines(intent.comment ?? ''), items: [] });
      ensureSeparatorBefore(doc, doc.groups.length - 1);
      break;
    }
    case 'renameGroup': {
      const group = getNamedGroup(doc, intent.group);
      group.name = validateGroupName(intent.name);
      delete group.header;
      break;
    }
    case 'updateGroupComment': {
      getNamedGroup(doc, intent.group).comment = toCommentLines(intent.comment);
      break;
    }
    case 'deleteGroup': {
      const group = getNamedGroup(doc, intent.group);
      if (!intent.deleteVariables) {
        doc.groups[intent.group - 1].items.push(...group.items);
      }
      doc.groups.splice(intent.group, 1);
      break;
    }
    case 'moveGroup': {
      const group = getNamedGroup(doc, intent.group);
      if (intent.toIndex < 1 || intent.toIndex >= doc.groups.length) {
        throw new EditError(`Group position ${intent.toIndex} is out of range.`);
      }
      doc.groups.splice(intent.group, 1);
      doc.groups.splice(intent.toIndex, 0, group);
      for (const index of [intent.toIndex, intent.toIndex + 1, intent.group]) {
        ensureSeparatorBefore(doc, index);
      }
      break;
    }
    case 'sortGroup':
      sortGroup(getGroup(doc, intent.group));
      break;
    case 'sortAll':
      doc.groups.forEach(sortGroup);
      break;
  }

  doc.groups.forEach(fixAdjacency);
  return doc;
}
