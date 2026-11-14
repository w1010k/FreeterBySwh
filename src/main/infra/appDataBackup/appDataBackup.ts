/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { copyFile, cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppDataBackup, BackupInfo } from '@/application/interfaces/appDataBackup';
import { tmpSuffix } from '@/infra/utils/atomicFile';

/** Written into every backup folder; a folder without it is not offered for restore. */
export const backupMarkerFile = 'freeter-backup.json';
const backupKind = 'Acedeck backup';
// Backups made before the app was renamed (up to 2.8.0-swh.32). Same contents, so they restore as well.
const oldBackupKind = 'Freeter-SWH backup';

// What a backup holds: projects, workflows and widgets (`app`), widget data (`widgets`, `shared`), and the window
// position (`window`). Not the usage history (`telemetry`, tens of MB, stays on this PC) and not the AI control
// endpoint (`ai`, belongs to the running app).
export const backedUpEntries = ['app', 'shared', 'widgets', 'window'] as const;

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const isNotFound = (err: unknown) => (err as NodeJS.ErrnoException)?.code === 'ENOENT';

/**
 * Copies a folder that the running app keeps writing to. Widget data is saved by writing `<key>.tmp` and renaming it,
 * and items can be deleted meanwhile: temporary files are skipped, and a file or folder that is gone by the time it is
 * copied is left out instead of failing the whole backup.
 */
async function copyLive(from: string, to: string): Promise<void> {
  let isDir: boolean;
  try {
    isDir = (await stat(from)).isDirectory();
  } catch (err) {
    if (isNotFound(err)) {
      return;
    }
    throw err;
  }
  if (!isDir) {
    try {
      await copyFile(from, to);
    } catch (err) {
      if (!isNotFound(err)) {
        throw err;
      }
    }
    return;
  }
  let names: string[];
  try {
    names = await readdir(from);
  } catch (err) {
    if (isNotFound(err)) {
      return;
    }
    throw err;
  }
  await mkdir(to, { recursive: true });
  for (const name of names) {
    if (!name.endsWith(tmpSuffix)) {
      await copyLive(join(from, name), join(to, name));
    }
  }
}

export function createAppDataBackup(): AppDataBackup {
  return {
    async write(appDataDir, targetDir, info) {
      // Not recursive: a folder that already exists is an error, so an older backup is never mixed in.
      await mkdir(targetDir);
      try {
        for (const entry of backedUpEntries) {
          await copyLive(join(appDataDir, entry), join(targetDir, entry));
        }
        // The marker goes last: a backup cut short (disk full) has none and cannot be restored.
        await writeFile(join(targetDir, backupMarkerFile), JSON.stringify({ kind: backupKind, ...info }, null, 2));
      } catch (err) {
        // Do not leave a half backup behind (it could look like data in the folder it was saved to).
        await rm(targetDir, { recursive: true, force: true }).catch(() => undefined);
        throw err;
      }
    },

    async readInfo(backupDir) {
      try {
        const data: unknown = JSON.parse(await readFile(join(backupDir, backupMarkerFile), 'utf8'));
        if (typeof data !== 'object' || data === null) {
          return null;
        }
        const { kind, version, createdAt } = data as Record<string, unknown>;
        return (kind === backupKind || kind === oldBackupKind) && typeof version === 'string' && typeof createdAt === 'string'
          ? { version, createdAt } satisfies BackupInfo
          : null;
      } catch {
        return null;
      }
    },

    async apply(appDataDir, backupDir, asideDir) {
      await mkdir(asideDir, { recursive: true });
      const movedAside: string[] = [];
      const copiedIn: string[] = [];
      try {
        for (const entry of backedUpEntries) {
          const current = join(appDataDir, entry);
          if (await exists(current)) {
            await rename(current, join(asideDir, entry));
            movedAside.push(entry);
          }
          const fromBackup = join(backupDir, entry);
          if (await exists(fromBackup)) {
            copiedIn.push(entry);
            await cp(fromBackup, current, { recursive: true });
          }
        }
      } catch (err) {
        // Put the current data back as it was: no restore is better than half of one. Each step is tried even when an
        // earlier one fails, so as much as possible goes back.
        let putBack = true;
        for (const entry of copiedIn) {
          await rm(join(appDataDir, entry), { recursive: true, force: true }).catch(() => { putBack = false; });
        }
        for (const entry of movedAside) {
          await rename(join(asideDir, entry), join(appDataDir, entry)).catch(() => { putBack = false; });
        }
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(putBack
          ? `${message}. The current data was kept.`
          : `${message}. Some current data could not be put back; it is in ${asideDir}.`);
      }
    },

    async setPending(pendingFile, backupDir) {
      await writeFile(pendingFile, JSON.stringify({ backupDir }));
    },

    async takePending(pendingFile) {
      let text: string;
      try {
        text = await readFile(pendingFile, 'utf8');
      } catch {
        return null;
      }
      // Taken once: a restore that fails is not tried again at every start. If the request cannot be removed (a
      // locked file), this throws, and the restore is not run: it would otherwise run again at every start.
      await rm(pendingFile, { force: true });
      try {
        const { backupDir } = JSON.parse(text) as { backupDir?: unknown };
        return typeof backupDir === 'string' ? backupDir : null;
      } catch {
        return null;
      }
    }
  };
}
