/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ReleaseProvider } from '@/application/interfaces/releaseProvider';

export type ReleaseFetchFn = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/** The fork's GitHub repository, where the CD workflow publishes the installers. */
export const releaseRepo = 'w1010k/FreeterBySwh';

const latestReleaseUrl = `https://api.github.com/repos/${releaseRepo}/releases/latest`;
const requestTimeoutMs = 15000;

export function createReleaseProvider(fetchFn: ReleaseFetchFn): ReleaseProvider {
  return {
    async getLatestTag() {
      // `releases/latest` skips drafts and pre-releases, so a release still being built is not announced.
      const res = await fetchFn(latestReleaseUrl, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(requestTimeoutMs)
      });
      if (!res.ok) {
        throw new Error(`Release check failed: ${res.status}`);
      }
      const body = await res.json();
      const tag = typeof body === 'object' && body !== null && 'tag_name' in body ? body.tag_name : undefined;
      if (typeof tag !== 'string') {
        throw new Error('Unexpected release reply');
      }
      return tag;
    }
  };
}
