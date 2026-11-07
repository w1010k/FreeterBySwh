/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { webpageAiActions } from '@/widgets/webpage/aiActions';

const [navigate] = webpageAiActions;

describe('webpageAiActions', () => {
  it('navigate opens the URL in the widget', async () => {
    const openUrl = jest.fn();
    await expect(Promise.resolve(navigate.run({ api: { openUrl }, settings: {} }, { url: 'https://a.test/x' }))).resolves.toEqual({ ok: true, value: null });
    expect(openUrl).toHaveBeenCalledWith('https://a.test/x');
  });

  it('answers not_ready when the page is not exposed', async () => {
    await expect(Promise.resolve(navigate.run({ api: { x: 1 }, settings: {} }, { url: 'https://a.test' }))).resolves.toMatchObject({ code: 'not_ready' });
  });

  it('parse accepts http and https only', () => {
    expect(navigate.parse({ url: 'https://a.test' })).toEqual({ url: 'https://a.test' });
    expect(navigate.parse({ url: 'http://a.test' })).toEqual({ url: 'http://a.test' });
    expect(navigate.parse({ url: 'file:///C:/x' })).toBeUndefined();
    expect(navigate.parse({ url: 'javascript:alert(1)' })).toBeUndefined();
    expect(navigate.parse({ url: 'not a url' })).toBeUndefined();
  });

  it('describes the navigation', () => {
    expect(navigate.describe({ url: 'https://a.test' }, 'Docs', {})).toBe('Open https://a.test in webpage widget "Docs"');
  });
});
