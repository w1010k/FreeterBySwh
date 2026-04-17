/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

/**
 * DOM CustomEvent name re-emitted on `window` after the main process broadcasts
 * an `ipcSharedDataChangedChannel` message. React components subscribe to this
 * to reload themselves when another widget sharing the same key writes.
 */
export const SHARED_DATA_CHANGED_EVENT = 'freeter:shared-data-changed';

export interface SharedDataChangedEventDetail {
  widgetType: string;
  sharedKeyId: string;
}
