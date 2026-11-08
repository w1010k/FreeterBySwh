/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { isSafeAgentId } from '@common/ai/agent';

describe('isSafeAgentId()', () => {
  it('takes UUIDs and refuses what a command line would read otherwise (an option, spaces, quotes)', () => {
    expect(isSafeAgentId('9263d6c7-bcd7-42bd-a043-a24e87dc1cfd')).toBe(true);
    expect(isSafeAgentId('--continue')).toBe(false);
    expect(isSafeAgentId('-x')).toBe(false);
    expect(isSafeAgentId('a b')).toBe(false);
    expect(isSafeAgentId('')).toBe(false);
  });
});
