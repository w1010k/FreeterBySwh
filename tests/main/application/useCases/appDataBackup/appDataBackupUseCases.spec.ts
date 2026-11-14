/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { join } from 'node:path';
import { AppDataBackup } from '@/application/interfaces/appDataBackup';
import { DialogProvider } from '@/application/interfaces/dialogProvider';
import { createApplyPendingRestoreUseCase } from '@/application/useCases/appDataBackup/applyPendingRestore';
import { createBackUpAppDataUseCase } from '@/application/useCases/appDataBackup/backUpAppData';
import { backupStamp } from '@/application/useCases/appDataBackup/backupStamp';
import { createRestoreAppDataUseCase } from '@/application/useCases/appDataBackup/restoreAppData';
import { mockShellProvider } from '@tests/infra/mocks/shellProvider';

const now = new Date(2026, 10, 13, 15, 30, 12);
const info = { version: '2.8.0-swh.29', createdAt: now.toISOString() };

function mocks(dirChoice: string | null, buttonResponse = 0) {
  const appDataBackup: jest.Mocked<AppDataBackup> = {
    write: jest.fn().mockResolvedValue(undefined),
    readInfo: jest.fn().mockResolvedValue(info),
    apply: jest.fn().mockResolvedValue(undefined),
    setPending: jest.fn().mockResolvedValue(undefined),
    takePending: jest.fn().mockResolvedValue(null),
  };
  const dialogProvider: jest.Mocked<DialogProvider> = {
    showOpenDirDialog: jest.fn().mockResolvedValue(dirChoice ? { canceled: false, filePaths: [dirChoice] } : { canceled: true, filePaths: [] }),
    showMessageBox: jest.fn().mockResolvedValue({ response: buttonResponse, checkboxChecked: false }),
    showOpenFileDialog: jest.fn(),
    showSaveFileDialog: jest.fn(),
  };
  const shellProvider = mockShellProvider({ openPath: jest.fn(async () => '') });
  return { appDataBackup, dialogProvider, shellProvider };
}

describe('backupStamp()', () => {
  it('is a sortable local time without characters a folder name cannot have', () => {
    expect(backupStamp(now)).toBe('2026-11-13 153012');
  });
});

describe('backUpAppDataUseCase()', () => {
  function setup(dirChoice: string | null, buttonResponse = 1) {
    const m = mocks(dirChoice, buttonResponse);
    const useCase = createBackUpAppDataUseCase({ ...m, appDataDir: '/data', version: '2.8.0-swh.29', now: () => now });
    return { ...m, useCase };
  }

  it('writes a dated backup folder in the chosen folder and offers to open it', async () => {
    const { useCase, appDataBackup, dialogProvider, shellProvider } = setup('/backups', 0);

    await useCase(null);

    const target = join('/backups', 'Acedeck backup 2026-11-13 153012');
    expect(appDataBackup.write).toHaveBeenCalledWith('/data', target, info);
    expect(dialogProvider.showMessageBox).toHaveBeenCalledWith(null, expect.objectContaining({ message: `Backup saved to:\n${target}` }));
    expect(shellProvider.openPath).toHaveBeenCalledWith(target);
  });

  it.each([
    ['the data folder', '/data'],
    ['a folder inside it', join('/data', 'widgets')],
    ['a folder inside it whose name starts with ..', join('/data', '..backup')],
  ])('refuses %s as the destination', async (_name, dir) => {
    const { useCase, appDataBackup, dialogProvider } = setup(dir);

    await useCase(null);

    expect(appDataBackup.write).not.toHaveBeenCalled();
    expect(dialogProvider.showMessageBox).toHaveBeenCalledWith(null, { type: 'warning', message: 'Choose a folder outside the Acedeck data folder.' });
  });

  it('does nothing when the folder choice is cancelled', async () => {
    const { useCase, appDataBackup } = setup(null);

    await useCase(null);

    expect(appDataBackup.write).not.toHaveBeenCalled();
  });

  it('tells the user when the backup fails', async () => {
    const { useCase, appDataBackup, dialogProvider } = setup('/backups');
    appDataBackup.write.mockRejectedValueOnce(new Error('disk full'));

    await useCase(null);

    expect(dialogProvider.showMessageBox).toHaveBeenCalledWith(null, { type: 'warning', message: 'The backup failed: disk full' });
  });
});

describe('restoreAppDataUseCase()', () => {
  function setup(dirChoice: string | null, buttonResponse: number) {
    const m = mocks(dirChoice, buttonResponse);
    const restart = jest.fn();
    const useCase = createRestoreAppDataUseCase({ ...m, pendingFile: '/p/restore-pending.json', restart });
    return { ...m, restart, useCase };
  }

  it('after the user confirms, asks the next start to restore the chosen backup and restarts', async () => {
    const { useCase, appDataBackup, dialogProvider, restart } = setup('/backups/b1', 0);

    await useCase(null);

    expect(dialogProvider.showMessageBox).toHaveBeenCalledWith(null, expect.objectContaining({
      type: 'warning', buttons: ['Restore and Restart', 'Cancel'], cancelId: 1, defaultId: 1
    }));
    expect(appDataBackup.setPending).toHaveBeenCalledWith('/p/restore-pending.json', '/backups/b1');
    expect(restart).toHaveBeenCalled();
  });

  it('does nothing when the user cancels the confirm box', async () => {
    const { useCase, appDataBackup, restart } = setup('/backups/b1', 1);

    await useCase(null);

    expect(appDataBackup.setPending).not.toHaveBeenCalled();
    expect(restart).not.toHaveBeenCalled();
  });

  it('refuses a folder that is not a backup', async () => {
    const { useCase, appDataBackup, dialogProvider, restart } = setup('/somewhere', 0);
    appDataBackup.readInfo.mockResolvedValueOnce(null);

    await useCase(null);

    expect(dialogProvider.showMessageBox).toHaveBeenCalledTimes(1);
    expect(dialogProvider.showMessageBox).toHaveBeenCalledWith(null, expect.objectContaining({ message: expect.stringContaining('not an Acedeck backup') }));
    expect(restart).not.toHaveBeenCalled();
  });
});

describe('applyPendingRestoreUseCase()', () => {
  function setup(pending: string | null) {
    const m = mocks(null);
    m.appDataBackup.takePending.mockResolvedValue(pending);
    const useCase = createApplyPendingRestoreUseCase({ ...m, appDataDir: join('/root', 'freeter-data'), pendingFile: '/p', now: () => now });
    return { ...m, useCase };
  }

  it('restores the pending backup, keeping the current data next to the data folder', async () => {
    const { useCase, appDataBackup } = setup('/backups/b1');

    await useCase();

    expect(appDataBackup.apply).toHaveBeenCalledWith(join('/root', 'freeter-data'), '/backups/b1', join('/root', 'freeter-data-before-restore 2026-11-13 153012'));
  });

  it('starts with the current data, and says so, when the restore request cannot be taken', async () => {
    const { useCase, appDataBackup, dialogProvider } = setup(null);
    appDataBackup.takePending.mockRejectedValueOnce(new Error('EPERM'));

    await expect(useCase()).resolves.toBeUndefined();

    expect(appDataBackup.apply).not.toHaveBeenCalled();
    expect(dialogProvider.showMessageBox).toHaveBeenCalledWith(null, expect.objectContaining({ message: expect.stringContaining('The restore did not run') }));
  });

  it('does nothing without a pending restore', async () => {
    const { useCase, appDataBackup } = setup(null);

    await useCase();

    expect(appDataBackup.apply).not.toHaveBeenCalled();
  });

  it('keeps the current data and tells the user when the backup is gone or the restore fails', async () => {
    const { useCase, appDataBackup, dialogProvider } = setup('/backups/b1');
    appDataBackup.readInfo.mockResolvedValueOnce(null);

    await useCase();

    expect(appDataBackup.apply).not.toHaveBeenCalled();
    expect(dialogProvider.showMessageBox).toHaveBeenCalledWith(null, expect.objectContaining({ message: expect.stringContaining('The restore failed') }));
  });
});
