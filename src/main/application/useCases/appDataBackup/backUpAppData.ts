/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { isAbsolute, join, relative, sep } from 'node:path';
import { AppDataBackup } from '@/application/interfaces/appDataBackup';
import { BrowserWindow } from '@/application/interfaces/browserWindow';
import { DialogProvider } from '@/application/interfaces/dialogProvider';
import { ShellProvider } from '@/application/interfaces/shellProvider';
import { backupStamp, errorText } from '@/application/useCases/appDataBackup/backupStamp';

interface BackUpDeps {
  appDataBackup: AppDataBackup;
  dialogProvider: DialogProvider;
  shellProvider: ShellProvider;
  appDataDir: string;
  version: string;
  now: () => Date;
}

export function createBackUpAppDataUseCase({ appDataBackup, dialogProvider, shellProvider, appDataDir, version, now }: BackUpDeps) {
  return async function backUpAppDataUseCase(win: BrowserWindow | null): Promise<void> {
    const { canceled, filePaths } = await dialogProvider.showOpenDirDialog(win, { title: 'Choose where to save the backup' });
    if (canceled || !filePaths[0]) {
      return;
    }
    // A backup inside the data folder would copy into itself or sit among live data. `..` counts only as a whole first
    // segment: a child folder named `..backup` is inside.
    const rel = relative(appDataDir, filePaths[0]);
    const isOutside = rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
    if (!isOutside) {
      await dialogProvider.showMessageBox(win, { type: 'warning', message: 'Choose a folder outside the Freeter data folder.' });
      return;
    }
    const time = now();
    const target = join(filePaths[0], `Freeter-SWH backup ${backupStamp(time)}`);
    try {
      await appDataBackup.write(appDataDir, target, { version, createdAt: time.toISOString() });
    } catch (err) {
      await dialogProvider.showMessageBox(win, { type: 'warning', message: `The backup failed: ${errorText(err)}` });
      return;
    }
    const { response } = await dialogProvider.showMessageBox(win, {
      type: 'info',
      message: `Backup saved to:\n${target}`,
      buttons: ['Open Folder', 'OK'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    });
    if (response === 0) {
      shellProvider.openPath(target);
    }
  }
}

export type BackUpAppDataUseCase = ReturnType<typeof createBackUpAppDataUseCase>;
