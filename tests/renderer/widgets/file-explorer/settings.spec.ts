/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createSettingsState, Settings } from '@/widgets/file-explorer/settings';

// createSettingsState hardens against malformed persisted data, so some tests
// deliberately pass values the Settings type forbids.
const malformed = (settings: unknown) => createSettingsState(settings as Partial<Settings>);

describe('file-explorer createSettingsState()', () => {
  it('should default to a single empty path, showFileSize=true and showHiddenFiles=false', () => {
    expect(createSettingsState({})).toEqual({ paths: [''], showFileSize: true, showHiddenFiles: false });
  })

  it('should keep valid paths and coerce non-string entries to empty strings', () => {
    expect(malformed({ paths: ['/a', 5, '/b'] }).paths).toEqual(['/a', '', '/b']);
  })

  it('should preserve an explicit showFileSize=false', () => {
    expect(createSettingsState({ showFileSize: false }).showFileSize).toBe(false);
  })

  it('should default showFileSize to true when not a boolean', () => {
    expect(malformed({ showFileSize: 'yes' }).showFileSize).toBe(true);
  })

  it('should preserve an explicit showHiddenFiles=true', () => {
    expect(createSettingsState({ showHiddenFiles: true }).showHiddenFiles).toBe(true);
  })

  it('should default showHiddenFiles to false when not a boolean', () => {
    expect(malformed({ showHiddenFiles: 'yes' }).showHiddenFiles).toBe(false);
  })
})
