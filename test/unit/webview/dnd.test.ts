import { describe, expect, it } from 'vitest';
import { groupDrop, keyboardGroupMove, keyboardVariableMove, variableDrop } from '../../../src/webview/dnd';

describe('variableDrop', () => {
  const counts = [1, 3, 2];

  it('moves down within a group (final index accounts for removal)', () => {
    expect(variableDrop(counts, { group: 1, index: 0 }, { group: 1, index: 2, position: 'after' })).toEqual({
      toGroup: 1,
      toIndex: 2,
    });
    expect(variableDrop(counts, { group: 1, index: 0 }, { group: 1, index: 2, position: 'before' })).toEqual({
      toGroup: 1,
      toIndex: 1,
    });
  });

  it('moves up within a group', () => {
    expect(variableDrop(counts, { group: 1, index: 2 }, { group: 1, index: 0, position: 'before' })).toEqual({
      toGroup: 1,
      toIndex: 0,
    });
  });

  it('returns null when dropped onto its own slot', () => {
    expect(variableDrop(counts, { group: 1, index: 1 }, { group: 1, index: 1, position: 'before' })).toBeNull();
    expect(variableDrop(counts, { group: 1, index: 1 }, { group: 1, index: 1, position: 'after' })).toBeNull();
    expect(variableDrop(counts, { group: 1, index: 1 }, { group: 1, index: 0, position: 'after' })).toBeNull();
    expect(variableDrop(counts, { group: 1, index: 2 }, { group: 1, end: true })).toBeNull();
  });

  it('moves across groups', () => {
    expect(variableDrop(counts, { group: 1, index: 0 }, { group: 2, index: 0, position: 'after' })).toEqual({
      toGroup: 2,
      toIndex: 1,
    });
    expect(variableDrop(counts, { group: 2, index: 1 }, { group: 0, end: true })).toEqual({ toGroup: 0, toIndex: 1 });
  });

  it('drops at the end of the source group', () => {
    expect(variableDrop(counts, { group: 1, index: 0 }, { group: 1, end: true })).toEqual({ toGroup: 1, toIndex: 2 });
  });
});

describe('groupDrop', () => {
  it('computes final group positions and never targets the implicit slot', () => {
    expect(groupDrop(4, 3, 1, 'before')).toBe(1);
    expect(groupDrop(4, 1, 3, 'after')).toBe(3);
    expect(groupDrop(4, 1, 3, 'before')).toBe(2);
    expect(groupDrop(4, 2, 2, 'before')).toBeNull();
    expect(groupDrop(4, 2, 1, 'after')).toBeNull();
    expect(groupDrop(4, 2, 0, 'after')).toBe(1);
    expect(groupDrop(4, 2, 0, 'before')).toBe(1);
  });
});

describe('keyboardVariableMove', () => {
  const counts = [1, 2, 0, 1];

  it('moves within a group', () => {
    expect(keyboardVariableMove(counts, { group: 1, index: 1 }, 'up')).toEqual({ toGroup: 1, toIndex: 0 });
    expect(keyboardVariableMove(counts, { group: 1, index: 0 }, 'down')).toEqual({ toGroup: 1, toIndex: 1 });
  });

  it('crosses into the neighbouring group at the edges', () => {
    expect(keyboardVariableMove(counts, { group: 1, index: 0 }, 'up')).toEqual({ toGroup: 0, toIndex: 1 });
    expect(keyboardVariableMove(counts, { group: 1, index: 1 }, 'down')).toEqual({ toGroup: 2, toIndex: 0 });
    expect(keyboardVariableMove(counts, { group: 3, index: 0 }, 'up')).toEqual({ toGroup: 2, toIndex: 0 });
  });

  it('stops at the document edges', () => {
    expect(keyboardVariableMove(counts, { group: 0, index: 0 }, 'up')).toBeNull();
    expect(keyboardVariableMove(counts, { group: 3, index: 0 }, 'down')).toBeNull();
  });
});

describe('keyboardGroupMove', () => {
  it('swaps with the neighbouring named group', () => {
    expect(keyboardGroupMove(4, 2, 'up')).toBe(1);
    expect(keyboardGroupMove(4, 2, 'down')).toBe(3);
    expect(keyboardGroupMove(4, 1, 'up')).toBeNull();
    expect(keyboardGroupMove(4, 3, 'down')).toBeNull();
  });
});
