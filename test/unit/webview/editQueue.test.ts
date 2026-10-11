import { describe, expect, it } from 'vitest';
import { EditQueue } from '../../../src/webview/editQueue';
import type { EditIntent, FromWebviewMessage } from '../../../src/shared/protocol';

const del = (index: number): EditIntent => ({ type: 'deleteVariable', ref: { group: 0, index } });

describe('EditQueue', () => {
  it('waits for a version before sending', () => {
    const posted: FromWebviewMessage[] = [];
    const q = new EditQueue((m) => posted.push(m));
    q.submit(del(0));
    expect(posted).toEqual([]);
    q.setVersion(3);
    expect(posted).toEqual([{ type: 'edit', version: 3, intent: del(0) }]);
  });

  it('sends one edit at a time, each with the version it was applied to', () => {
    const posted: FromWebviewMessage[] = [];
    const q = new EditQueue((m) => posted.push(m));
    q.setVersion(1);
    q.submit(del(0));
    q.submit(del(1));
    expect(posted).toHaveLength(1);
    q.setVersion(2);
    expect(posted).toEqual([
      { type: 'edit', version: 1, intent: del(0) },
      { type: 'edit', version: 2, intent: del(1) },
    ]);
  });

  it('continues after a failed edit', () => {
    const posted: FromWebviewMessage[] = [];
    const q = new EditQueue((m) => posted.push(m));
    q.setVersion(1);
    q.submit(del(0));
    q.submit(del(1));
    q.failed();
    expect(posted.at(-1)).toEqual({ type: 'edit', version: 1, intent: del(1) });
  });
});
