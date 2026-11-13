/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

export interface BackupInfo {
  /** App version that made the backup. */
  version: string;
  /** ISO time the backup was made. */
  createdAt: string;
}

export interface AppDataBackup {
  /** Copies the app data into the new folder `targetDir` (it must not exist yet). */
  write(appDataDir: string, targetDir: string, info: BackupInfo): Promise<void>;
  /** The backup's info, or null when `backupDir` is not a complete backup. */
  readInfo(backupDir: string): Promise<BackupInfo | null>;
  /**
   * Replaces the app data with the backup. The data it replaces moves into `asideDir`. On an error it puts the current
   * data back and throws; the message says whether all of it went back.
   */
  apply(appDataDir: string, backupDir: string, asideDir: string): Promise<void>;
  /** Asks the next start to restore `backupDir` (before any data is loaded). */
  setPending(pendingFile: string, backupDir: string): Promise<void>;
  /** The backup asked for by `setPending`, once; null when none. Rejects when the request cannot be removed. */
  takePending(pendingFile: string): Promise<string | null>;
}
