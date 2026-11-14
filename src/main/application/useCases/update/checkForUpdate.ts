/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ReleaseProvider } from '@/application/interfaces/releaseProvider';
import { ShellProvider } from '@/application/interfaces/shellProvider';
import { DataStorage } from '@common/application/interfaces/dataStorage';

// `2.8.0-swh.29` or `v2.8.0-swh.29`; a plain upstream version (`2.8.0`) counts as fork release 0.
const versionPattern = /^v?(\d+)\.(\d+)\.(\d+)(?:-swh\.(\d+))?$/;

function parseVersion(v: string): number[] | null {
  const m = versionPattern.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 0)] : null;
}

/** True when `latest` is a later release than `current`. False when either does not look like a release version. */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return a[i] > b[i];
    }
  }
  return false;
}

/** appDataStorage key: the last version the user was told about. */
export const updateNotifiedKey = 'update-notified';

interface Deps {
  releaseProvider: ReleaseProvider;
  appDataStorage: DataStorage;
  shellProvider: ShellProvider;
  currentVersion: string;
  /** Shows an OS notification; `onClick` runs when the user clicks it. False when it could not be shown. */
  notify: (title: string, body: string, onClick: () => void) => boolean;
  releasePageUrl: (tag: string) => string;
}

export function createCheckForUpdateUseCase({ releaseProvider, appDataStorage, shellProvider, currentVersion, notify, releasePageUrl }: Deps) {
  // Runs from timers: it never rejects. Offline, blocked, rate-limited or a storage error: try again at the next check.
  return async function checkForUpdateUseCase(): Promise<void> {
    try {
      const tag = await releaseProvider.getLatestTag();
      // The tag comes from the network: only a version-shaped tag is shown or put into a URL.
      if (!isNewerVersion(tag, currentVersion)) {
        return;
      }
      const version = tag.replace(/^v/, '');
      // Once per version: a user who skipped it is not asked again every day.
      if (await appDataStorage.getText(updateNotifiedKey) === version) {
        return;
      }
      const shown = notify(
        `Acedeck ${version} is available`,
        `You have ${currentVersion}. Click to open the download page.`,
        () => { shellProvider.openExternal(releasePageUrl(tag)); }
      );
      // Remembered only once shown, so a notification the system could not show is tried again.
      if (shown) {
        await appDataStorage.setText(updateNotifiedKey, version);
      }
    } catch {
      // Nothing to do: the next check tries again.
    }
  }
}

export type CheckForUpdateUseCase = ReturnType<typeof createCheckForUpdateUseCase>;
