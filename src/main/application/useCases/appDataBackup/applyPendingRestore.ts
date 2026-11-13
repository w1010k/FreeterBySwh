/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { join } from 'node:path';
import { AppDataBackup } from '@/application/interfaces/appDataBackup';
import { DialogProvider } from '@/application/interfaces/dialogProvider';
import { backupStamp, errorText } from '@/application/useCases/appDataBackup/backupStamp';

interface ApplyPendingDeps {
  appDataBackup: AppDataBackup;
  dialogProvider: DialogProvider;
  appDataDir: string;
  pendingFile: string;
  now: () => Date;
}

/** Runs at start, before the data is loaded: restores the backup that Restore Data asked for, if any. */
export function createApplyPendingRestoreUseCase({ appDataBackup, dialogProvider, appDataDir, pendingFile, now }: ApplyPendingDeps) {
  return async function applyPendingRestoreUseCase(): Promise<void> {
    // Never throws: the app must start with its current data whatever happens here.
    let backupDir: string | null;
    try {
      backupDir = await appDataBackup.takePending(pendingFile);
    } catch (err) {
      dialogProvider.showMessageBox(null, { type: 'warning', message: `The restore did not run (its request file ${pendingFile} could not be removed): ${errorText(err)}` });
      return;
    }
    if (!backupDir) {
      return;
    }
    const asideDir = join(appDataDir, '..', `freeter-data-before-restore ${backupStamp(now())}`);
    try {
      // Checked again: the folder may have changed or gone since it was chosen.
      if (!await appDataBackup.readInfo(backupDir)) {
        throw new Error(`${backupDir} is no longer a complete backup`);
      }
      await appDataBackup.apply(appDataDir, backupDir, asideDir);
    } catch (err) {
      // Not awaited: the app starts with its current data while the message shows.
      dialogProvider.showMessageBox(null, { type: 'warning', message: `The restore failed: ${errorText(err)}` });
    }
  }
}

export type ApplyPendingRestoreUseCase = ReturnType<typeof createApplyPendingRestoreUseCase>;
