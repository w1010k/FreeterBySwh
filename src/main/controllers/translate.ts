/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Controller } from '@/controllers/controller';
import { IpcTranslateTextsArgs, IpcTranslateTextsRes, ipcTranslateTextsChannel } from '@common/ipc/channels';
import { TranslateTextsUseCase } from '@/application/useCases/translate/translateTexts';

type Deps = {
  translateTextsUseCase: TranslateTextsUseCase;
}

export function createTranslateControllers({
  translateTextsUseCase,
}: Deps): [
    Controller<IpcTranslateTextsArgs, IpcTranslateTextsRes>,
  ] {
  return [{
    channel: ipcTranslateTextsChannel,
    handle: async (_event, texts) => translateTextsUseCase(texts)
  }]
}
