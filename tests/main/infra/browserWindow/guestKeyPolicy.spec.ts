/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { decideGuestKey, GuestKeyInput } from '@/infra/browserWindow/guestKeyPolicy';

type Mods = Partial<Pick<GuestKeyInput, 'control' | 'alt' | 'meta' | 'shift'>>;
const key = (k: string, mods: Mods = {}, code = ''): GuestKeyInput =>
  ({ type: 'keyDown', key: k, code, control: false, alt: false, meta: false, shift: false, ...mods });
const noUrl = () => '';

describe('decideGuestKey()', () => {
  it.each([
    ['Ctrl+Tab', key('Tab', { control: true }), { kind: 'switchWorkflow', offset: 1 }],
    ['Ctrl+Shift+Tab', key('Tab', { control: true, shift: true }), { kind: 'switchWorkflow', offset: -1 }],
    ['Alt+Left', key('ArrowLeft', { alt: true }), { kind: 'history', dir: 'back' }],
    ['Alt+Right', key('ArrowRight', { alt: true }), { kind: 'history', dir: 'forward' }],
    ['Alt+Home', key('Home', { alt: true }), { kind: 'goHome' }],
    ['F5', key('F5'), { kind: 'reload' }],
    ['Ctrl+R', key('r', { control: true }, 'KeyR'), { kind: 'reload' }],
    ['Cmd+R', key('r', { meta: true }, 'KeyR'), { kind: 'reload' }],
    ['Ctrl+Shift+= (+)', key('+', { control: true, shift: true }), { kind: 'zoom', direction: 'in' }],
    ['Ctrl+-', key('-', { control: true }), { kind: 'zoom', direction: 'out' }],
    ['Ctrl+0', key('0', { control: true }), { kind: 'zoom', direction: 'reset' }],
  ])('maps %s', (_name, input, action) => {
    expect(decideGuestKey(input, noUrl)).toEqual(action);
  });

  it.each([
    ['a key release', { ...key('F5'), type: 'keyUp' }],
    ['Cmd+Tab (the macOS app switcher)', key('Tab', { meta: true })],
    ['Alt+Shift+Left', key('ArrowLeft', { alt: true, shift: true })],
    ['Shift+F5', key('F5', { shift: true })],
    ['Ctrl+Shift+R (left for a hard reload)', key('r', { control: true, shift: true }, 'KeyR')],
    ['Ctrl+Alt+T', key('t', { control: true, alt: true }, 'KeyT')],
    ['a plain letter', key('t', {}, 'KeyT')],
    ['bare = without Shift', key('=', { control: true })],
  ])('leaves %s to the page', (_name, input) => {
    expect(decideGuestKey(input, noUrl)).toBeNull();
  });

  it('matches Ctrl+T by code, so other layouts work', () => {
    expect(decideGuestKey(key('е', { control: true }, 'KeyT'), () => 'https://example.com/a'))
      .toEqual({ kind: 'openInBrowser', url: 'https://example.com/a' });
  });

  it.each([
    'file:///C:/Windows/notepad.exe',
    'freeter-file://freeter-app/index.html',
    'javascript:alert(1)',
    '',
  ])('swallows Ctrl+T without a URL to open for %p', url => {
    expect(decideGuestKey(key('t', { control: true }, 'KeyT'), () => url)).toEqual({ kind: 'openInBrowser', url: null });
  });

  it('reads the URL only for Ctrl+T', () => {
    const getUrl = jest.fn(() => 'https://example.com/');
    decideGuestKey(key('F5'), getUrl);
    decideGuestKey(key('r', { control: true }, 'KeyR'), getUrl);
    expect(getUrl).not.toHaveBeenCalled();
  });
});
