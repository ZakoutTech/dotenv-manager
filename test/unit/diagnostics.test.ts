import { describe, expect, it } from 'vitest';
import { computeProblems } from '../../src/core/diagnostics';

describe('computeProblems', () => {
  it('locates an undefined reference', () => {
    expect(computeProblems('A=1\nB=x${NOPE}\n')).toEqual([
      { kind: 'undefined', line: 1, character: 3, endLine: 1, endCharacter: 10, message: 'Undefined variable NOPE' },
    ]);
  });

  it('accounts for spacing and quotes before the value', () => {
    const [problem] = computeProblems('B = "a ${NOPE}"\n');
    expect([problem.line, problem.character, problem.endCharacter]).toEqual([0, 7, 14]);
  });

  it('reports each member of a reference cycle', () => {
    expect(computeProblems('A=${B}\nB=${A}\n')).toEqual([
      { kind: 'cycle', line: 0, character: 2, endLine: 0, endCharacter: 6, message: 'Reference cycle: A → B → A' },
      { kind: 'cycle', line: 1, character: 2, endLine: 1, endCharacter: 6, message: 'Reference cycle: B → A → B' },
    ]);
  });

  it('maps references in multiline CRLF values to the right line', () => {
    expect(computeProblems('K="a\r\n${NOPE}"\r\n')).toEqual([
      { kind: 'undefined', line: 1, character: 0, endLine: 1, endCharacter: 7, message: 'Undefined variable NOPE' },
    ]);
  });

  it('ignores single-quoted values and references with defaults', () => {
    expect(computeProblems("A='${NOPE}'\nB=${NOPE:-x}\n")).toEqual([]);
  });

  it('accounts for the BOM and export prefix', () => {
    const [problem] = computeProblems('﻿export A=$NOPE\n');
    expect([problem.line, problem.character, problem.endCharacter]).toEqual([0, 9, 14]);
  });
});
