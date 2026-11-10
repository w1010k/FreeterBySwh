/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { DialogProvider } from '@/application/interfaces/dialogProvider';

/**
 * Ask before an action that cannot be undone. The OK button names the action (`okLabel`, e.g. "Delete Widget"),
 * Cancel is the default (Enter does not destroy), and `noLink` keeps a custom label a button on Windows.
 * True when the user picks `okLabel`.
 */
export async function confirmDialog(dialog: Pick<DialogProvider, 'showMessageBox'>, message: string, okLabel: string): Promise<boolean> {
  const res = await dialog.showMessageBox({ message, buttons: [okLabel, 'Cancel'], cancelId: 1, defaultId: 1, type: 'warning', noLink: true });
  return res.response === 0;
}
