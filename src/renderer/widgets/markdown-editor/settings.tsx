/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { CreateSettingsState, ReactComponent, SettingsEditorReactComponentProps, SettingBlock, SettingRow, SettingActions, browse14Svg } from '@/widgets/appModules';

export interface Settings {
  /** Absolute path of the folder whose Markdown files the tree lists. */
  folder: string;
}

export const createSettingsState: CreateSettingsState<Settings> = (settings) => ({
  folder: typeof settings.folder === 'string' ? settings.folder : ''
})

function SettingsEditorComp({settings, settingsApi}: SettingsEditorReactComponentProps<Settings>) {
  const {folder} = settings;
  const {updateSettings, dialog} = settingsApi;

  return (
    <SettingBlock
      titleForId='markdown-editor-folder'
      title='Folder'
      moreInfo='The tree shows the subfolders and Markdown files (.md, .markdown) of this folder.'
    >
      <SettingRow>
        <input
          id='markdown-editor-folder'
          type='text'
          value={folder}
          placeholder='Enter a folder path'
          onChange={e => updateSettings({...settings, folder: e.target.value})}
        />
        <SettingActions
          actions={[{
            id: 'SELECT-PATH',
            icon: browse14Svg,
            title: 'Select Folder',
            doAction: async () => {
              const { canceled, filePaths } = await dialog.showOpenDirDialog({defaultPath: folder, multiSelect: false});
              if (!canceled && filePaths[0]) {
                updateSettings({...settings, folder: filePaths[0]});
              }
            }
          }]}
        />
      </SettingRow>
    </SettingBlock>
  )
}

export const settingsEditorComp: ReactComponent<SettingsEditorReactComponentProps<Settings>> = {
  type: 'react',
  Comp: SettingsEditorComp
}
