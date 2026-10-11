// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { readInitialMessages } from '../../../src/webview/initialState';

describe('readInitialMessages', () => {
  it('reads the embedded messages', () => {
    document.body.innerHTML = '<script type="application/json" id="initial-state">[{"type":"settings","defaultView":"text"}]</script>';
    expect(readInitialMessages(document)).toEqual([{ type: 'settings', defaultView: 'text' }]);
  });

  it('returns no messages when the block is missing or malformed', () => {
    document.body.innerHTML = '';
    expect(readInitialMessages(document)).toEqual([]);
    document.body.innerHTML = '<script type="application/json" id="initial-state">{oops</script>';
    expect(readInitialMessages(document)).toEqual([]);
  });
});
