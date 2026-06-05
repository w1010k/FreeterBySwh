/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Button, CreateSettingsState, List, ReactComponent, SettingsEditorReactComponentProps, SettingBlock, SettingRow, SettingActions, addItemToList, removeItemFromList, browse14Svg, delete14Svg } from '@/widgets/appModules';
import { useLayoutEffect, useRef } from 'react';

export interface Settings {
  paths: List<string>;
  showFileSize: boolean;
  showHiddenFiles: boolean;
}

export const createSettingsState: CreateSettingsState<Settings> = (settings) => ({
  paths: Array.isArray(settings.paths) ? settings.paths.map(path => typeof path === 'string' ? path : '') : [''],
  showFileSize: typeof settings.showFileSize === 'boolean' ? settings.showFileSize : true,
  showHiddenFiles: typeof settings.showHiddenFiles === 'boolean' ? settings.showHiddenFiles : false
})

function SettingsEditorComp({settings, settingsApi}: SettingsEditorReactComponentProps<Settings>) {
  const {paths} = settings;
  const {updateSettings, dialog} = settingsApi;
  const pathRefs = useRef<Array<HTMLInputElement | null>>([]);
  const shouldFocusLastPathRef = useRef(false);

  useLayoutEffect(() => {
    if (shouldFocusLastPathRef.current) {
      pathRefs.current[paths.length - 1]?.focus();
      shouldFocusLastPathRef.current = false;
    }
  }, [paths.length]);

  const updPath = (i: number, path: string) => updateSettings({...settings, paths: paths.map((_path, _i) => i !== _i ? _path : path)});
  const addPath = () => updateSettings({...settings, paths: addItemToList(paths, '')});
  const deletePath = (i: number) => updateSettings({...settings, paths: removeItemFromList(paths, i)});

  const pickPath = async (curPath: string) => {
    const { canceled, filePaths } = await dialog.showOpenDirDialog({defaultPath: curPath, multiSelect: false});
    return canceled ? null : filePaths[0];
  }

  return (
    <>
    <SettingBlock
      titleForId='file-explorer-path0'
      title='Folders'
      moreInfo='Folders to show at the root of the tree. Each can be expanded to browse its contents.'
    >
      {paths.map((path, i) => (
        <SettingRow key={i}>
          <input
            ref={(el) => {pathRefs.current[i] = el}}
            id={'file-explorer-path' + i}
            type='text'
            value={path}
            placeholder='Enter a folder path'
            onChange={e => updPath(i, e.target.value)}
          />
          <SettingActions
            actions={[{
              id: 'SELECT-PATH',
              icon: browse14Svg,
              title: 'Select Folder',
              doAction: async () => {
                const picked = await pickPath(paths[i]);
                if (picked) {
                  updPath(i, picked);
                }
              }
            }, {
              id: 'DELETE',
              icon: delete14Svg,
              title: 'Delete Folder Path',
              doAction: async () => deletePath(i)
            }]}
          />
        </SettingRow>
      ))}
      <div>
        <Button
          onClick={_ => {
            addPath();
            shouldFocusLastPathRef.current = true;
          }}
          caption='Add a folder path'
          primary={true}
        ></Button>
      </div>
    </SettingBlock>
    <SettingBlock
      titleForId='file-explorer-show-file-size'
      title='File sizes'
      moreInfo='Show each file’s size at the right end of its row.'
    >
      <label>
        <input
          id='file-explorer-show-file-size'
          type='checkbox'
          checked={settings.showFileSize}
          onChange={e => updateSettings({...settings, showFileSize: e.target.checked})}
        /> Show file sizes
      </label>
    </SettingBlock>
    <SettingBlock
      titleForId='file-explorer-show-hidden-files'
      title='Hidden files'
      moreInfo='Show entries whose name starts with a dot (e.g. .git, .env). The Windows “hidden” file attribute is not used — only the leading-dot convention.'
    >
      <label>
        <input
          id='file-explorer-show-hidden-files'
          type='checkbox'
          checked={settings.showHiddenFiles}
          onChange={e => updateSettings({...settings, showHiddenFiles: e.target.checked})}
        /> Show hidden files
      </label>
    </SettingBlock>
    </>
  )
}

export const settingsEditorComp: ReactComponent<SettingsEditorReactComponentProps<Settings>> = {
  type: 'react',
  Comp: SettingsEditorComp
}
