/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { DownloadManager } from '@/application/interfaces/downloadManager';
import { createSetDownloadDirUseCase } from '@/application/useCases/download/setDownloadDir';

describe('setDownloadDirUseCase()', () => {
  it('should forward the dir to the download manager', () => {
    const downloadManager: DownloadManager = { setDownloadDir: jest.fn() };
    const useCase = createSetDownloadDirUseCase({ downloadManager });

    useCase('C:\\Downloads\\custom');

    expect(downloadManager.setDownloadDir).toHaveBeenCalledWith('C:\\Downloads\\custom');
  });
});
