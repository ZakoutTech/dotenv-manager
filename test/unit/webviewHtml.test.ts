import { describe, expect, it } from 'vitest';
import { createNonce, getWebviewHtml } from '../../src/editor/webviewHtml';

describe('getWebviewHtml', () => {
  const html = getWebviewHtml({
    nonce: 'abc123',
    scriptUri: 'vscode-webview://x/dist/webview.js',
    styleUri: 'vscode-webview://x/dist/webview.css',
    cspSource: 'vscode-webview://x',
  });

  it('links the webview stylesheet', () => {
    expect(html).toContain('<link rel="stylesheet" href="vscode-webview://x/dist/webview.css">');
  });

  it('declares a restrictive Content-Security-Policy', () => {
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("script-src 'nonce-abc123'");
    expect(html).toContain('style-src vscode-webview://x');
  });

  it('loads the webview bundle with the nonce', () => {
    expect(html).toContain('<script nonce="abc123" src="vscode-webview://x/dist/webview.js"></script>');
  });

  it('renders the app root element', () => {
    expect(html).toContain('<div id="app"></div>');
    expect(html).toContain('<title>Dotenv Manager</title>');
  });

  it('escapes attribute values', () => {
    const evil = getWebviewHtml({ nonce: 'n', scriptUri: '"><img src=x>', styleUri: 's', cspSource: 'c' });
    expect(evil).not.toContain('"><img');
    expect(evil).toContain('&quot;&gt;&lt;img');
  });
});

describe('getWebviewHtml initial state', () => {
  const base = { nonce: 'n', scriptUri: 's', styleUri: 'c', cspSource: 'x' };

  it('embeds initial messages as non-executable JSON', () => {
    const html = getWebviewHtml({ ...base, initialMessages: [{ type: 'settings', defaultView: 'text' }] });
    const json = /<script type="application\/json" id="initial-state">(.*?)<\/script>/s.exec(html)?.[1];
    expect(JSON.parse(json ?? 'null')).toEqual([{ type: 'settings', defaultView: 'text' }]);
  });

  it('escapes file content so it cannot close the script tag', () => {
    const html = getWebviewHtml({ ...base, initialMessages: [{ type: 'error', message: '</script><img src=x onerror=alert(1)>' }] });
    expect(html).not.toContain('</script><img');
    const json = /<script type="application\/json" id="initial-state">(.*?)<\/script>/s.exec(html)?.[1];
    expect(JSON.parse(json ?? 'null')[0].message).toBe('</script><img src=x onerror=alert(1)>');
  });

  it('omits the state block when there is nothing to embed', () => {
    expect(getWebviewHtml(base)).not.toContain('initial-state');
  });
});

describe('createNonce', () => {
  it('returns a 32-character alphanumeric string', () => {
    expect(createNonce()).toMatch(/^[A-Za-z0-9]{32}$/);
  });

  it('returns a different value on each call', () => {
    expect(createNonce()).not.toBe(createNonce());
  });
});
