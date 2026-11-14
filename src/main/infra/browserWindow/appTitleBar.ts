/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

/**
 * Windows, Linux: the main window has no OS title bar (titleBarStyle 'hidden'); the app draws its own with the theme
 * colors and the OS draws only the window buttons over it. macOS keeps its title bar and the menu at the top of the
 * screen. The one place this is decided: the window options, the app menu provider and the renderer (ProcessInfo) read it.
 */
export const hasAppTitleBar = process.platform !== 'darwin';
