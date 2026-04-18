/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { IpcZoomWebpageDirection } from '@common/ipc/channels';

export const WEBPAGE_ZOOM_EVENT = 'freeter:webpage-zoom';

export interface WebpageZoomEventDetail {
  webContentsId: number;
  direction: IpcZoomWebpageDirection;
}
