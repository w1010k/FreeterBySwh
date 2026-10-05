/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createSystemStatsProvider } from '@/infra/systemStatsProvider/systemStatsProvider';

describe('SystemStatsProvider', () => {
  it('returns the same sample to calls within 500ms, and a fresh one after', () => {
    let nowMs = 1000;
    const provider = createSystemStatsProvider(() => nowMs);
    const first = provider.getStats();
    nowMs += 499;
    expect(provider.getStats()).toBe(first);
    nowMs += 1;
    expect(provider.getStats()).not.toBe(first);
  })
})
