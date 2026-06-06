/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppStore } from '@/application/interfaces/store';
import { DownloadProvider } from '@/application/interfaces/downloadProvider';

type Deps = {
  appStore: AppStore;
  download: DownloadProvider;
}

export function createInitDownloadDirUseCase({
  appStore,
  download,
}: Deps) {
  const initDownloadDirUseCase = () => {
    appStore.subscribe(state => ({
      isLoading: state.isLoading,
      downloadDir: state.ui.appConfig.downloadDir,
    }), ({
      isLoading,
      downloadDir,
    }) => {
      if (!isLoading) {
        download.setDownloadDir(downloadDir)
      }
    }, { fireImmediately: true });
  }

  return initDownloadDirUseCase;
}

export type InitDownloadDirUseCase = ReturnType<typeof createInitDownloadDirUseCase>;
