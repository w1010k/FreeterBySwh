/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ShellProvider } from '../../interfaces/shellProvider';

interface Deps {
  shellProvider: ShellProvider;
  appDataDir: string;
}

export function createOpenAppDataDirUseCase({ shellProvider, appDataDir }: Deps) {
  return async function openAppDataDirUseCase(): Promise<string> {
    return shellProvider.openPath(appDataDir);
  }
}

export type OpenAppDataDirUseCase = ReturnType<typeof createOpenAppDataDirUseCase>;
