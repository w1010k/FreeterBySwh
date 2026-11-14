/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

/**
 * The folder (under the OS app-data folder) that holds the app's userData: projects, widget data, the sessions of
 * Webpage widgets, the single-instance lock.
 *
 * The names are the app's former name on purpose. The app was renamed to Acedeck, but the data stays where every
 * existing install has it. Electron would otherwise derive the folder from the app name and start empty. Do not make
 * these follow the product name.
 *
 * A run from the repo (`yarn dev`, `yarn prod:run`) gets its own folder, so it never shares data, session or lock
 * with an installed release.
 */
export function userDataDirName(isPackaged: boolean): string {
  return isPackaged ? 'freeter-swh' : 'freeter-swh-dev';
}
