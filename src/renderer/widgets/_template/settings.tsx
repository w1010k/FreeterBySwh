/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { CreateSettingsState, ReactComponent, SettingsEditorReactComponentProps, SettingBlock } from '@/widgets/appModules';

export interface Settings {
  text: string;
}

export const createSettingsState: CreateSettingsState<Settings> = (settings) => ({
  text: typeof settings.text === 'string' ? settings.text : ''
})

function SettingsEditorComp({settings, settingsApi}: SettingsEditorReactComponentProps<Settings>) {
  const {text} = settings;
  const {updateSettings} = settingsApi;
  // Wrap every setting in a SettingBlock (Title Case title, `titleForId` = the control's id)
  // so a widget copied from this template matches the other settings editors.
  return (
    <>
      <SettingBlock titleForId='template-text' title='Text'>
        <input type="text" id="template-text" name="text" value={text} onChange={e => updateSettings({ text: e.target.value})}/>
      </SettingBlock>
    </>
  )
}

export const settingsEditorComp: ReactComponent<SettingsEditorReactComponentProps<Settings>> = {
  type: 'react',
  Comp: SettingsEditorComp
}
