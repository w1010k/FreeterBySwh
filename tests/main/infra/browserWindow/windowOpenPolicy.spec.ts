/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { decideWindowOpen } from '@/infra/browserWindow/windowOpenPolicy';

const req = (url: string, disposition = 'foreground-tab', features = '', openPopups = 0) => ({ url, disposition, features, openPopups, maxPopups: 5 });

describe('decideWindowOpen()', () => {
  it('sends a "new tab" web link to the default browser', () => {
    expect(decideWindowOpen(req('https://example.com/a'))).toEqual({ kind: 'external', url: 'https://example.com/a' });
    expect(decideWindowOpen(req('mailto:a@b.c'))).toEqual({ kind: 'external', url: 'mailto:a@b.c' });
  });

  it.each([
    ['popup features', req('https://idp.test/login', 'foreground-tab', 'popup,width=400,height=300')],
    ['disposition new-window', req('https://idp.test/login', 'new-window')],
    ['an empty window, filled or pointed by the page afterwards', req('')],
    ['about:blank', req('about:blank')],
  ])('opens %s in the app', (_name, r) => {
    expect(decideWindowOpen(r)).toEqual({ kind: 'popup' });
  });

  it.each([
    'zoommtg://zoom.us/join?confno=1',
    'file:///C:/Windows/notepad.exe',
    'javascript:alert(1)',
  ])('blocks a "new tab" request for %s (not web or mail)', url => {
    expect(decideWindowOpen(req(url))).toEqual({ kind: 'blocked', reason: 'scheme' });
  });

  it('blocks a popup over the limit, empty ones included', () => {
    expect(decideWindowOpen(req('https://idp.test/', 'new-window', '', 5))).toEqual({ kind: 'blocked', reason: 'popupLimit' });
    expect(decideWindowOpen(req('', 'foreground-tab', '', 5))).toEqual({ kind: 'blocked', reason: 'popupLimit' });
    expect(decideWindowOpen(req('https://idp.test/', 'new-window', '', 4))).toEqual({ kind: 'popup' });
  });
});
