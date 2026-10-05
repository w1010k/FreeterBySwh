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
  const nav = { isRequestForNavigation: true };

  it('should prevent the default (request cancellation) and pass entered credentials to the callback', async () => {
    const event = { preventDefault: jest.fn() };
    const callback = jest.fn();
    const handler = createLoginHandler(async () => ({ username: 'user', password: 'pw' }));

    handler(event, wc, nav, authInfo(), callback);

    expect(event.preventDefault).toHaveBeenCalled();
    await Promise.resolve();
    expect(callback).toHaveBeenCalledWith('user', 'pw');
  });

  it('should call the callback without arguments when the prompt is cancelled', async () => {
    const callback = jest.fn();
    const handler = createLoginHandler(async () => null);

    handler({ preventDefault: jest.fn() }, wc, nav, authInfo(), callback);

    await Promise.resolve();
    expect(callback).toHaveBeenCalledWith();
  });

  it('should call the callback without arguments when the prompt fails', async () => {
    const callback = jest.fn();
    const handler = createLoginHandler(async () => { throw new Error('boom'); });

    handler({ preventDefault: jest.fn() }, wc, nav, authInfo(), callback);

    await Promise.resolve();
    await Promise.resolve();
    expect(callback).toHaveBeenCalledWith();
  });

  it('should leave a subresource challenge to the default cancel, but prompt for proxy auth', () => {
    const prompt = jest.fn(async () => null);
    const handler = createLoginHandler(prompt);
    const event = { preventDefault: jest.fn() };

    handler(event, wc, { isRequestForNavigation: false }, authInfo(), jest.fn());
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();

    handler(event, wc, { isRequestForNavigation: false }, authInfo({ isProxy: true }), jest.fn());
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('should open one prompt at a time per webContents', async () => {
    let answer: (cred: null) => void = () => undefined;
    const prompt = jest.fn(() => new Promise<null>(resolve => { answer = resolve; }));
    const handler = createLoginHandler(prompt);
    const second = { preventDefault: jest.fn() };

    handler({ preventDefault: jest.fn() }, wc, nav, authInfo(), jest.fn());
    handler(second, wc, nav, authInfo(), jest.fn());
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(second.preventDefault).not.toHaveBeenCalled();

    answer(null);
    await Promise.resolve();
    handler({ preventDefault: jest.fn() }, wc, nav, authInfo(), jest.fn());
    expect(prompt).toHaveBeenCalledTimes(2);
  });
});
