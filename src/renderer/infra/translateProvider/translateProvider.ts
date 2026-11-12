/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { IpcTranslateTextsArgs, ipcTranslateTextsChannel, IpcTranslateTextsRes } from '@common/ipc/channels';
import { electronIpcRenderer } from '@/infra/mainApi/mainApi';
import { TranslateProvider } from '@/application/interfaces/translateProvider';

export function createTranslateProvider(): TranslateProvider {
  return {
    translateTexts: (texts) => electronIpcRenderer.invoke<IpcTranslateTextsArgs, IpcTranslateTextsRes>(ipcTranslateTextsChannel, texts)
  }
}
