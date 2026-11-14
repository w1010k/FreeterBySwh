/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { electronIpcRenderer } from '@/infra/mainApi/mainApi';
import { startWidgetEventRelay } from '@/infra/widgetEventRelay/widgetEventRelay';
import { SHARED_DATA_CHANGED_EVENT } from '@/base/sharedDataEvents';
import { WEBPAGE_GO_HOME_EVENT } from '@/widgets/webpage/homeEvents';
import { WEBPAGE_WINDOW_BLOCKED_EVENT } from '@/widgets/webpage/windowBlockedEvents';
import { WEBPAGE_ZOOM_EVENT } from '@/widgets/webpage/zoomEvents';
import {
  ipcGoHomeWebpageChannel, ipcSharedDataChangedChannel, ipcWebpageWindowBlockedChannel, ipcZoomWebpageChannel
} from '@common/ipc/channels';

jest.mock('@/infra/mainApi/mainApi');

const onMock = electronIpcRenderer.on as jest.Mock;

function setup() {
  onMock.mockReset();
  startWidgetEventRelay();
  const send = (channel: string, ...args: unknown[]) => {
    const listener = onMock.mock.calls.find(c => c[0] === channel)?.[1] as (...a: unknown[]) => void;
    listener(...args);
  };
  const details = (eventName: string) => {
    const got: unknown[] = [];
    window.addEventListener(eventName, e => got.push((e as CustomEvent).detail));
    return got;
  };
  return { send, details };
}

describe('startWidgetEventRelay()', () => {
  it.each([
    [ipcZoomWebpageChannel, WEBPAGE_ZOOM_EVENT, [7, 'in'], { webContentsId: 7, direction: 'in' }],
    [ipcZoomWebpageChannel, WEBPAGE_ZOOM_EVENT, [7, 'reset'], { webContentsId: 7, direction: 'reset' }],
    [ipcGoHomeWebpageChannel, WEBPAGE_GO_HOME_EVENT, [7], { webContentsId: 7 }],
    [ipcWebpageWindowBlockedChannel, WEBPAGE_WINDOW_BLOCKED_EVENT, [7, 'zoommtg://x', 'scheme'], { webContentsId: 7, url: 'zoommtg://x', reason: 'scheme' }],
    [ipcWebpageWindowBlockedChannel, WEBPAGE_WINDOW_BLOCKED_EVENT, [7, '', 'popupLimit'], { webContentsId: 7, url: '', reason: 'popupLimit' }],
    [ipcSharedDataChangedChannel, SHARED_DATA_CHANGED_EVENT, ['note', 'k1'], { widgetType: 'note', sharedKeyId: 'k1' }],
  ])('re-emits %s as %s', (channel, eventName, args, detail) => {
    const { send, details } = setup();
    const got = details(eventName);
    send(channel, ...args);
    expect(got).toEqual([detail]);
  });

  it.each([
    [ipcZoomWebpageChannel, WEBPAGE_ZOOM_EVENT, ['7', 'in']],
    [ipcZoomWebpageChannel, WEBPAGE_ZOOM_EVENT, [7, 'sideways']],
    [ipcGoHomeWebpageChannel, WEBPAGE_GO_HOME_EVENT, [undefined]],
    [ipcWebpageWindowBlockedChannel, WEBPAGE_WINDOW_BLOCKED_EVENT, [7, 'https://a.test', 'other']],
    [ipcWebpageWindowBlockedChannel, WEBPAGE_WINDOW_BLOCKED_EVENT, [7, null, 'scheme']],
    [ipcSharedDataChangedChannel, SHARED_DATA_CHANGED_EVENT, ['note', 1]],
  ])('drops a malformed %s message', (channel, eventName, args) => {
    const { send, details } = setup();
    const got = details(eventName);
    send(channel, ...args);
    expect(got).toEqual([]);
  });
});
