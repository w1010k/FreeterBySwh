/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

/** File menu Back Up Data / Restore Data: main shows the dialogs and does the work. */
export interface AppDataBackupProvider {
  backUp(): Promise<void>;
  restore(): Promise<void>;
}
