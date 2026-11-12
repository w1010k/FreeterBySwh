/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ipcTranslateTextsChannel } from '@common/ipc/channels';
import { createTranslateControllers } from '@/controllers/translate';
import { fixtureIpcMainEvent } from '@tests/infra/mocks/ipcMain';

describe('TranslateControllers', () => {
  it('passes the texts to the use case and returns its result', async () => {
    const translateTextsUseCase = jest.fn(async () => ['KO']);
    const [controller] = createTranslateControllers({ translateTextsUseCase });

    expect(controller.channel).toBe(ipcTranslateTextsChannel);
    await expect(controller.handle(fixtureIpcMainEvent(), ['x'])).resolves.toEqual(['KO']);
    expect(translateTextsUseCase).toHaveBeenCalledWith(['x']);
  });
});
