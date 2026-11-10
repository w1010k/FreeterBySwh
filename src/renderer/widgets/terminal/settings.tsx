/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { useState } from 'react';
import type { UiThemeId } from '@/base/uiTheme';
import { CreateSettingsState, ReactComponent, SettingsEditorReactComponentProps, SettingBlock } from '@/widgets/appModules';

export interface Settings {
  /** Shell program; empty = the platform default (PowerShell 7 if found, else Windows PowerShell, on Windows; $SHELL elsewhere). */
  shell: string;
  /** Start folder; empty = the user's home folder. */
  cwd: string;
  /** Typed into the shell when it starts, e.g. "claude". */
  startCommand: string;
  /** The base font size; Ctrl+= / Ctrl+- / Ctrl+wheel zoom from it for the app session, Ctrl+0 goes back. */
  fontSize: number;
  /** The terminal's colors: the app theme's, or always light or dark. */
  theme: TerminalThemeSetting;
}

/** A fixed palette (a key of terminalThemes, the app theme ids) or 'app' (follow the app theme). */
export type TerminalThemeSetting = UiThemeId | 'app';
// A Record over the type: adding a theme id fails to compile until it has a name here.
const terminalThemeNames: Record<TerminalThemeSetting, string> = { dark: 'Dark', light: 'Light', app: 'Follow App' };
export const terminalThemeSettings = Object.keys(terminalThemeNames) as TerminalThemeSetting[];
// Dark: the terminal was always dark before it had this setting, so saved widgets keep that.
const THEME_DEFAULT: TerminalThemeSetting = 'dark';
const isTerminalThemeSetting = (v: unknown): v is TerminalThemeSetting => terminalThemeSettings.includes(v as TerminalThemeSetting);

export const FONT_SIZE_MIN = 6;
export const FONT_SIZE_MAX = 48;
const FONT_SIZE_DEFAULT = 13;
export const clampFontSize = (n: number) => Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(n)));

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export const createSettingsState: CreateSettingsState<Settings> = (settings) => ({
  shell: str(settings.shell),
  cwd: str(settings.cwd),
  startCommand: str(settings.startCommand),
  fontSize: typeof settings.fontSize === 'number' && Number.isFinite(settings.fontSize) ? clampFontSize(settings.fontSize) : FONT_SIZE_DEFAULT,
  theme: isTerminalThemeSetting(settings.theme) ? settings.theme : THEME_DEFAULT,
})

function SettingsEditorComp({settings, settingsApi}: SettingsEditorReactComponentProps<Settings>) {
  const {updateSettings} = settingsApi;
  // What is typed: "2" on the way to "20" is not clamped to 6. A size in range is saved; leaving the box shows the saved one.
  const [fontSizeText, setFontSizeText] = useState<string | null>(null);
  return (
    <>
      <SettingBlock titleForId='terminal-shell' title='Shell' moreInfo='Program to run, e.g. pwsh.exe, cmd.exe, bash. Empty: PowerShell 7 on Windows when installed (else Windows PowerShell), your $SHELL elsewhere. The menu next to + in the widget opens a tab with another shell.'>
        <input type="text" id="terminal-shell" value={settings.shell} placeholder="(default)" onChange={e => updateSettings({ ...settings, shell: e.target.value })}/>
      </SettingBlock>
      <SettingBlock titleForId='terminal-cwd' title='Start Folder'>
        <input type="text" id="terminal-cwd" value={settings.cwd} placeholder="(your home folder)" onChange={e => updateSettings({ ...settings, cwd: e.target.value })}/>
      </SettingBlock>
      <SettingBlock
        titleForId='terminal-start-command'
        title='Start Command'
        moreInfo='Typed into the shell when it starts, e.g. claude or codex. In the terminal, the freeter command (installed app) lets an agent use Freeter.'
      >
        <input type="text" id="terminal-start-command" value={settings.startCommand} onChange={e => updateSettings({ ...settings, startCommand: e.target.value })}/>
      </SettingBlock>
      <SettingBlock
        titleForId='terminal-font-size'
        title='Font Size'
        moreInfo='In the terminal, Ctrl+= and Ctrl+- (or Ctrl+mouse wheel) zoom until Freeter closes; Ctrl+0 goes back to this size.'
      >
        <input
          type="number"
          id="terminal-font-size"
          min={FONT_SIZE_MIN}
          max={FONT_SIZE_MAX}
          value={fontSizeText ?? settings.fontSize}
          onChange={e => {
            setFontSizeText(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value !== '' && Number.isInteger(n) && n >= FONT_SIZE_MIN && n <= FONT_SIZE_MAX) {
              updateSettings({ ...settings, fontSize: n });
            }
          }}
          onBlur={() => setFontSizeText(null)}
        />
      </SettingBlock>
      <SettingBlock titleForId='terminal-theme' title='Theme' moreInfo='The colors of the terminal. Follow App uses the light or dark theme set in the application settings.'>
        <select id="terminal-theme" value={settings.theme} onChange={e => updateSettings({ ...settings, theme: e.target.value as TerminalThemeSetting })}>
          {terminalThemeSettings.map(id => <option key={id} value={id}>{terminalThemeNames[id]}</option>)}
        </select>
      </SettingBlock>
      <p>The font size and the theme apply at once. Other changes apply when the shell restarts (Restart Shell in the action bar).</p>
    </>
  )
}

export const settingsEditorComp: ReactComponent<SettingsEditorReactComponentProps<Settings>> = {
  type: 'react',
  Comp: SettingsEditorComp
}
