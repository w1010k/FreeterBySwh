/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { userDataDirName } from '@/base/userDataDir';

describe('userDataDirName()', () => {
  // Existing installs keep their data in these folders. A change here makes the app start empty.
  it('keeps the data folder of the installed app, whatever the product is called', () => {
    expect(userDataDirName(true)).toBe('freeter-swh');
  });

  it('gives a run from the repo its own folder', () => {
    expect(userDataDirName(false)).toBe('freeter-swh-dev');
  });
});
