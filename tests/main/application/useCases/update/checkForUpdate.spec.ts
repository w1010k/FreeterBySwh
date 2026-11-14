/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createCheckForUpdateUseCase, isNewerVersion, updateNotifiedKey } from '@/application/useCases/update/checkForUpdate';
import { mockShellProvider } from '@tests/infra/mocks/shellProvider';
import { DataStorage } from '@common/application/interfaces/dataStorage';

function setup(latestTag: string | Error, notified?: string, shown = true) {
  const store = new Map<string, string>(notified ? [[updateNotifiedKey, notified]] : []);
  const appDataStorage: DataStorage = {
    getText: jest.fn(async (key: string) => store.get(key)),
    setText: jest.fn(async (key: string, text: string) => { store.set(key, text); }),
    deleteItem: jest.fn(),
    clear: jest.fn(),
    getKeys: jest.fn(),
  };
  const shellProvider = mockShellProvider({ openExternal: jest.fn(async () => undefined) });
  const notify = jest.fn((_title: string, _body: string, _onClick: () => void) => shown);
  const checkForUpdateUseCase = createCheckForUpdateUseCase({
    releaseProvider: { getLatestTag: jest.fn(async () => { if (latestTag instanceof Error) { throw latestTag; } return latestTag; }) },
    appDataStorage,
    shellProvider,
    currentVersion: '2.8.0-swh.29',
    notify,
    releasePageUrl: tag => `https://example.test/releases/tag/${tag}`
  });
  return { checkForUpdateUseCase, notify, shellProvider, store, appDataStorage };
}

describe('isNewerVersion()', () => {
  it.each([
    ['v2.8.0-swh.30', '2.8.0-swh.29', true],
    ['2.8.0-swh.100', '2.8.0-swh.99', true],
    ['v2.9.0-swh.1', '2.8.0-swh.29', true],
    ['v3.0.0', '2.8.0-swh.29', true],
    ['v2.8.0-swh.29', '2.8.0-swh.29', false],
    ['v2.8.0-swh.28', '2.8.0-swh.29', false],
    ['v2.8.0', '2.8.0-swh.29', false],
    ['nightly', '2.8.0-swh.29', false],
    ['v2.8.0-swh.30<script>', '2.8.0-swh.29', false],
    ['v2.8.0-swh.30', 'dev', false],
  ])('%s over %s: %s', (latest, current, expected) => {
    expect(isNewerVersion(latest, current)).toBe(expected);
  });
});

describe('checkForUpdateUseCase()', () => {
  it('notifies about a newer release once, and opens its page on click', async () => {
    const { checkForUpdateUseCase, notify, shellProvider, store } = setup('v2.8.0-swh.30');

    await checkForUpdateUseCase();
    await checkForUpdateUseCase();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('Acedeck 2.8.0-swh.30 is available', 'You have 2.8.0-swh.29. Click to open the download page.', expect.any(Function));
    expect(store.get(updateNotifiedKey)).toBe('2.8.0-swh.30');
    notify.mock.calls[0][2]();
    expect(shellProvider.openExternal).toHaveBeenCalledWith('https://example.test/releases/tag/v2.8.0-swh.30');
  });

  it('notifies again for a release newer than the one already notified', async () => {
    const { checkForUpdateUseCase, notify } = setup('v2.8.0-swh.31', '2.8.0-swh.30');

    await checkForUpdateUseCase();

    expect(notify).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the same version', 'v2.8.0-swh.29'],
    ['an older version', 'v2.8.0-swh.28'],
    ['a tag that is not a version', 'latest'],
  ])('does not notify for %s', async (_name, tag) => {
    const { checkForUpdateUseCase, notify } = setup(tag);

    await checkForUpdateUseCase();

    expect(notify).not.toHaveBeenCalled();
  });

  it('tries again later when the system could not show the notification', async () => {
    const { checkForUpdateUseCase, notify, store } = setup('v2.8.0-swh.30', undefined, false);

    await checkForUpdateUseCase();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(store.has(updateNotifiedKey)).toBe(false);
  });

  it('never rejects (it runs from timers), also when the storage fails', async () => {
    const { checkForUpdateUseCase, appDataStorage } = setup('v2.8.0-swh.30');
    (appDataStorage.getText as jest.Mock).mockRejectedValueOnce(new Error('EACCES'));

    await expect(checkForUpdateUseCase()).resolves.toBeUndefined();
  });

  it('does nothing when the release cannot be read (offline)', async () => {
    const { checkForUpdateUseCase, notify } = setup(new Error('offline'));

    await expect(checkForUpdateUseCase()).resolves.toBeUndefined();
    expect(notify).not.toHaveBeenCalled();
  });
});
