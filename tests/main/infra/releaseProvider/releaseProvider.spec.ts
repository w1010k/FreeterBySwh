/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createReleaseProvider } from '@/infra/releaseProvider/releaseProvider';

const reply = (ok: boolean, status: number, body: unknown) => jest.fn(async () => ({ ok, status, json: async () => body }));

describe('releaseProvider.getLatestTag()', () => {
  it('reads tag_name of the latest release of the fork repository', async () => {
    const fetchFn = reply(true, 200, { tag_name: 'v2.8.0-swh.30', name: 'x' });

    await expect(createReleaseProvider(fetchFn).getLatestTag()).resolves.toBe('v2.8.0-swh.30');
    expect(fetchFn).toHaveBeenCalledWith('https://api.github.com/repos/w1010k/FreeterBySwh/releases/latest', expect.objectContaining({
      headers: { Accept: 'application/vnd.github+json' },
      signal: expect.any(AbortSignal)
    }));
  });

  it('rejects on an HTTP error (rate limit)', async () => {
    await expect(createReleaseProvider(reply(false, 403, {})).getLatestTag()).rejects.toThrow('403');
  });

  it.each([null, {}, { tag_name: 3 }, 'v2'])('rejects an unexpected reply %p', async body => {
    await expect(createReleaseProvider(reply(true, 200, body)).getLatestTag()).rejects.toThrow();
  });
});
