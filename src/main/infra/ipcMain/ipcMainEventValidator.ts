/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { IpcMainEventValidator } from '@/controllers/interfaces/ipcMain';

/**
 * Accepts an IPC message only from the app page itself: a known channel, sent by
 * the main frame of a page at `scheme://authority`. The scheme is checked as well
 * as the host, because a single-label host like `freeter-app` could also be served
 * over http by anyone on the LAN who answers that name.
 */
export function createIpcMainEventValidator(channelPrefix: string, authority: string, scheme: string): IpcMainEventValidator {
  return (channel, event) => {
    if (!channel || !channel.startsWith(channelPrefix)) {
      console.error(`IpcMain event: Unknown channel '${channel}'.`)
      return false;
    }

    if (!event.senderFrame) {
      console.error('IpcMain event: No sender frame.')
      return false;
    }

    const { url } = event.senderFrame;
    const { isSenderFrameMain: isMainFrame } = event;

    let host = '';
    let protocol = '';
    try {
      ({ host, protocol } = new URL(url));
    } catch (error) {
      console.error(`IpcMain event: Invalid URL '${url}' on channel '${channel}.`)
      return false;
    }

    // `.origin` is not usable here: Node returns "null" for non-special schemes.
    if (host !== authority || protocol !== `${scheme}:`) {
      console.error(`IpcMain event: Bad origin of '${protocol}//${host}' on channel '${channel}.`)
      return false;
    }

    if (!isMainFrame) {
      console.error(`IpcMain event: Sender of origin '${host}' on channel '${channel} is not a main frame.`)
      return false;
    }

    return true;
  }
}
