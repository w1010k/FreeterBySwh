/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { CreateSettingsState, ReactComponent, SettingsEditorReactComponentProps, SettingBlock } from '@/widgets/appModules';

export interface Settings {
  /** Shell program; empty = the platform default (PowerShell on Windows, $SHELL elsewhere). */
  shell: string;
  /** Start folder; empty = the user's home folder. */
  cwd: string;
  /** Typed into the shell when it starts, e.g. "claude". */
  startCommand: string;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export const createSettingsState: CreateSettingsState<Settings> = (settings) => ({
  shell: str(settings.shell),
  cwd: str(settings.cwd),
  startCommand: str(settings.startCommand),
})

function SettingsEditorComp({settings, settingsApi}: SettingsEditorReactComponentProps<Settings>) {
  const {updateSettings} = settingsApi;
  return (
    <>
      <SettingBlock titleForId='terminal-shell' title='Shell' moreInfo='Program to run, e.g. pwsh.exe, cmd.exe, bash. Empty: PowerShell on Windows, your $SHELL elsewhere.'>
        <input type="text" id="terminal-shell" value={settings.shell} placeholder="(your home folder)" onChange={e => updateSettings({ ...settings, shell: e.target.value })}/>
      </SettingBlock>
      <SettingBlock titleForId='terminal-cwd' title='Start Folder'>
        <input type="text" id="terminal-cwd" value={settings.cwd} placeholder="(default)" onChange={e => updateSettings({ ...settings, cwd: e.target.value })}/>
      </SettingBlock>
      <SettingBlock
        titleForId='terminal-start-command'
        title='Start Command'
        moreInfo='Typed into the shell when it starts, e.g. claude or codex. In the terminal, the freeter command (installed app) lets an agent use Freeter.'
      >
        <input type="text" id="terminal-start-command" value={settings.startCommand} onChange={e => updateSettings({ ...settings, startCommand: e.target.value })}/>
      </SettingBlock>
      <p>Changes apply when the shell restarts (Restart Shell in the action bar).</p>
    </>
  )
}

export const settingsEditorComp: ReactComponent<SettingsEditorReactComponentProps<Settings>> = {
  type: 'react',
  Comp: SettingsEditorComp
}
