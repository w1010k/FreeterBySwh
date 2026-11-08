/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createSubscribers } from '@/infra/subscribers/subscribers';

describe('createSubscribers()', () => {
  it('an unsubscribe that runs again later does not remove newer subscribers of that id', () => {
    const subs = createSubscribers<string>();
    const first = jest.fn();
    const second = jest.fn();
    const off = subs.add('x', first);
    off();
    subs.add('x', second);
    off();
    subs.emit('x', 'hi');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('hi');
  });
});
