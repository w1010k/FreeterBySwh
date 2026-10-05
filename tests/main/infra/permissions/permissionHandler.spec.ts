/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

// Only the pure decision is under test; stub the module-level electron import
// so importing the module doesn't require a real Electron environment.
jest.mock('electron', () => ({
  app: { on: () => undefined },
  session: { defaultSession: { setPermissionRequestHandler: () => undefined } },
}), { virtual: true });

import { shouldGrantPermission } from '@/infra/permissions/permissionHandler';

describe('shouldGrantPermission()', () => {
  it('should grant openExternal for web and mail urls', () => {
    expect(shouldGrantPermission('openExternal', 'https://freeter.io/')).toBe(true);
    expect(shouldGrantPermission('openExternal', 'mailto:someone@example.com')).toBe(true);
  });

  it('should deny openExternal for app protocols and a missing url', () => {
    expect(shouldGrantPermission('openExternal', 'zoommtg://zoom.us/join')).toBe(false);
    expect(shouldGrantPermission('openExternal', 'ms-settings:privacy')).toBe(false);
    expect(shouldGrantPermission('openExternal', undefined)).toBe(false);
  });

  it('should keep granting every other permission, as Electron does by default', () => {
    expect(shouldGrantPermission('notifications', undefined)).toBe(true);
    expect(shouldGrantPermission('media', undefined)).toBe(true);
  });
});
