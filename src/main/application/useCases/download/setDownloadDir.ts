/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { DownloadManager } from '@/application/interfaces/downloadManager';

type Deps = {
  downloadManager: DownloadManager;
}

export function createSetDownloadDirUseCase({
  downloadManager,
}: Deps) {
  const useCase = (dir: string) => {
    downloadManager.setDownloadDir(dir);
  }

  return useCase;
}

export type SetDownloadDirUseCase = ReturnType<typeof createSetDownloadDirUseCase>;
