/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppDataBackup } from '@/application/interfaces/appDataBackup';
import { BrowserWindow } from '@/application/interfaces/browserWindow';
import { DialogProvider } from '@/application/interfaces/dialogProvider';

interface RestoreDeps {
  appDataBackup: AppDataBackup;
  dialogProvider: DialogProvider;
  pendingFile: string;
  /** Quits and starts the app again (the restore runs at the start, before any data is loaded). */
  restart: () => void;
}

export function createRestoreAppDataUseCase({ appDataBackup, dialogProvider, pendingFile, restart }: RestoreDeps) {
  return async function restoreAppDataUseCase(win: BrowserWindow | null): Promise<void> {
    const { canceled, filePaths } = await dialogProvider.showOpenDirDialog(win, { title: 'Choose an Acedeck backup folder' });
    if (canceled || !filePaths[0]) {
      return;
    }
    const backupDir = filePaths[0];
    const info = await appDataBackup.readInfo(backupDir);
    if (!info) {
      await dialogProvider.showMessageBox(win, {
        type: 'warning',
        message: 'This folder is not an Acedeck backup. Choose an "Acedeck backup ..." folder made by Back Up Data.'
      });
      return;
    }
    const { response } = await dialogProvider.showMessageBox(win, {
      type: 'warning',
      message: `Restore the backup made on ${new Date(info.createdAt).toLocaleString()} (Acedeck ${info.version})?\n\n`
        + 'It replaces all projects, workflows and widget data on this PC. The current data is kept in a '
        + '"freeter-data-before-restore" folder next to the data folder.\n\nAcedeck restarts to restore.',
      buttons: ['Restore and Restart', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    });
    if (response !== 0) {
      return;
    }
    await appDataBackup.setPending(pendingFile, backupDir);
    restart();
  }
}

export type RestoreAppDataUseCase = ReturnType<typeof createRestoreAppDataUseCase>;
