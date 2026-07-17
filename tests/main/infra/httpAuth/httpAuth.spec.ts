/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

// Only the pure parts are under test; stub electron so importing the module
// doesn't require a real Electron environment.
jest.mock('electron', () => ({
  app: { on: () => undefined },
  BrowserWindow: { fromWebContents: () => null },
}), { virtual: true });

import { buildAuthPromptHtml, createLoginHandler } from '@/infra/httpAuth/httpAuth';
import { AuthInfo, WebContents } from 'electron';

const authInfo = (overrides?: Partial<AuthInfo>): AuthInfo => ({
  isProxy: false,
  scheme: 'basic',
  host: 'internal.host',
  port: 8080,
  realm: 'Staging',
  ...overrides
});

describe('buildAuthPromptHtml()', () => {
  it('should include the host, port and realm', () => {
    const html = buildAuthPromptHtml(authInfo());
    expect(html).toContain('internal.host:8080');
    expect(html).toContain('Realm: Staging');
    expect(html).toContain('The server');
  });

  it('should say "proxy" for proxy auth and omit an empty realm', () => {
    const html = buildAuthPromptHtml(authInfo({ isProxy: true, realm: '' }));
    expect(html).toContain('The proxy');
    expect(html).not.toContain('Realm:');
  });

  it('should escape html in the server-controlled realm and host', () => {
    const html = buildAuthPromptHtml(authInfo({ host: 'a<b', realm: '<script>x</script>' }));
    expect(html).not.toContain('a<b');
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('a&lt;b');
  });
});

describe('createLoginHandler()', () => {
  const wc = {} as WebContents;

  it('should prevent the default (request cancellation) and pass entered credentials to the callback', async () => {
    const event = { preventDefault: jest.fn() };
    const callback = jest.fn();
    const handler = createLoginHandler(async () => ({ username: 'user', password: 'pw' }));

    handler(event, wc, {}, authInfo(), callback);

    expect(event.preventDefault).toHaveBeenCalled();
    await Promise.resolve();
    expect(callback).toHaveBeenCalledWith('user', 'pw');
  });

  it('should call the callback without arguments when the prompt is cancelled', async () => {
    const callback = jest.fn();
    const handler = createLoginHandler(async () => null);

    handler({ preventDefault: jest.fn() }, wc, {}, authInfo(), callback);

    await Promise.resolve();
    expect(callback).toHaveBeenCalledWith();
  });

  it('should call the callback without arguments when the prompt fails', async () => {
    const callback = jest.fn();
    const handler = createLoginHandler(async () => { throw new Error('boom'); });

    handler({ preventDefault: jest.fn() }, wc, {}, authInfo(), callback);

    await Promise.resolve();
    await Promise.resolve();
    expect(callback).toHaveBeenCalledWith();
  });
});
