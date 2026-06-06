/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ApplicationSettingsViewModelHook } from '@/ui/components/applicationSettings/applicationSettingsViewModel';
import clsx from 'clsx';
import styles from './applicationSettings.module.scss';
import settingsScreenStyles from '@/ui/components/basic/settingsScreen/settingsScreen.module.scss'
import { SettingsScreen } from '@/ui/components/basic/settingsScreen/settingsScreen';
import { SettingBlock } from '@/widgets/appModules';
import { memo } from 'react';
import { convertBoolToStr, convertStrToBool } from '@/base/convTypes';

type Deps = {
  useApplicationSettingsViewModel: ApplicationSettingsViewModelHook;
}

export function createApplicationSettingsComponent({
  useApplicationSettingsViewModel,
}: Deps) {
  function ApplicationSettings() {

    const {
      appConfig,
      hotkeyOptions,
      updateSettings,
      onBrowseDownloadDirHandler,
      onResetDownloadDirHandler,
      onBrowseBgImageHandler,
      onClearBgImageHandler,
      onOkClickHandler,
      onCancelClickHandler,
      uiThemeOptions,
      inactiveAfterOptions,
      activateOnProjectSwitchOptions
    } = useApplicationSettingsViewModel();

    if (appConfig) {
      return (<SettingsScreen title='Application Settings' onOkClick={onOkClickHandler} onCancelClick={onCancelClickHandler}>
        <div className={clsx(settingsScreenStyles['settings-screen-panel'], styles['settings-editor'])}>
          <SettingBlock
            titleForId='main-hot-key'
            title='Hotkey Combination'
            moreInfo='Hotkey enables you to bring Freeter to the front of the screen by pressing the specified key
                      combination.'
          >
            <select id="main-hot-key" value={appConfig.mainHotkey} onChange={e => updateSettings({
              ...appConfig,
              mainHotkey: e.target.value
            })}>
              {hotkeyOptions.map(item=>(
                <option key={item.value} value={item.value}>{item.caption}</option>
              ))}
            </select>
          </SettingBlock>

          <SettingBlock
            titleForId='ui-theme'
            title='User Interface Theme'
            moreInfo='The interface theme defines the appearance of all visual elements of the user interface.'
          >
            <select id="ui-theme" value={appConfig.uiTheme} onChange={e => updateSettings({
              ...appConfig,
              uiTheme: e.target.value
            })}>
              {uiThemeOptions.map(item=>(
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </SettingBlock>

          <SettingBlock
            titleForId='download-dir'
            title='Download folder'
            moreInfo='Where files downloaded from Webpage widgets are saved. Leave empty to use the
                      system default Downloads folder.'
          >
            <div className={styles['download-dir-row']}>
              <input
                id="download-dir"
                type="text"
                value={appConfig.downloadDir}
                placeholder='Default (system Downloads folder)'
                onChange={e => updateSettings({ ...appConfig, downloadDir: e.target.value })}
              />
              <button type="button" onClick={onBrowseDownloadDirHandler}>Browse…</button>
              {appConfig.downloadDir !== '' && <button type="button" onClick={onResetDownloadDirHandler}>Use default</button>}
            </div>
          </SettingBlock>

          <SettingBlock
            titleForId='worktable-bg-color'
            title='Workflow background color'
            moreInfo='Custom background color for the workflow area. Leave as default to use the theme color.'
          >
            <div className={styles['download-dir-row']}>
              <input
                id="worktable-bg-color"
                type="color"
                value={appConfig.bgColor !== '' ? appConfig.bgColor : '#ffffff'}
                onChange={e => updateSettings({ ...appConfig, bgColor: e.target.value })}
              />
              {appConfig.bgColor !== '' && <button type="button" onClick={() => updateSettings({ ...appConfig, bgColor: '' })}>Use default</button>}
            </div>
          </SettingBlock>

          <SettingBlock
            titleForId='worktable-bg-image'
            title='Workflow background image'
            moreInfo='Optional image shown behind the widgets. Leave empty for no image.'
          >
            <div className={styles['download-dir-row']}>
              <input
                id="worktable-bg-image"
                type="text"
                value={appConfig.bgImage}
                placeholder='No image'
                onChange={e => updateSettings({ ...appConfig, bgImage: e.target.value })}
              />
              <button type="button" onClick={onBrowseBgImageHandler}>Browse…</button>
              {appConfig.bgImage !== '' && <button type="button" onClick={onClearBgImageHandler}>Clear</button>}
            </div>
            {appConfig.bgImage !== '' && <select
              aria-label='Background image fit'
              value={appConfig.bgImageMode}
              onChange={e => updateSettings({ ...appConfig, bgImageMode: e.target.value as typeof appConfig.bgImageMode })}
            >
              <option value="cover">Fill (cover)</option>
              <option value="contain">Fit (contain)</option>
              <option value="center">Center</option>
              <option value="tile">Tile</option>
            </select>}
          </SettingBlock>

          {(appConfig.bgColor !== '' || appConfig.bgImage !== '') && <SettingBlock
            titleForId='worktable-bg-opacity'
            title='Workflow background opacity'
            moreInfo='Opacity of the custom background color/image. Lower values let the theme background show through.'
          >
            <div className={styles['download-dir-row']}>
              <input
                id="worktable-bg-opacity"
                type="range"
                min={0}
                max={100}
                step={5}
                value={appConfig.bgOpacity}
                onChange={e => updateSettings({ ...appConfig, bgOpacity: Number.parseInt(e.target.value) })}
              />
              <span>{appConfig.bgOpacity}%</span>
            </div>
          </SettingBlock>}

          <SettingBlock
            title='Memory Saver'
            moreInfo='Freeter frees up memory from inactive workflows.
                      This gives active workflows more computer resources and keeps Freeter
                      fast. Your inactive workflows automatically become active again when
                      you go back to them.'
          >
            <SettingBlock
              titleForId='mem-saver-inactive'
              title='Workflow becomes inactive after'
              moreInfo='This setting defines when workflows become inactive.'
            >
              <select id="mem-saver-inactive" value={appConfig.memSaver.workflowInactiveAfter} onChange={e => updateSettings({
                ...appConfig,
                memSaver: {
                  ...appConfig.memSaver,
                  workflowInactiveAfter: Number.parseInt(e.target.value)
                }
              })}>
                {inactiveAfterOptions.map(item=>(
                  <option key={item.val} value={item.val}>{item.name}</option>
                ))}
              </select>
            </SettingBlock>
            <SettingBlock
              titleForId='mem-saver-activate-on-project'
              title='Activate all workflows when switching project'
              moreInfo='When turned on, switching to a project will activate all of its workflows.'
            >
              <select id="mem-saver-activate-on-project" value={convertBoolToStr(appConfig.memSaver.activateWorkflowsOnProjectSwitch)} onChange={e => updateSettings({
                ...appConfig,
                memSaver: {
                  ...appConfig.memSaver,
                  activateWorkflowsOnProjectSwitch: convertStrToBool(e.target.value)
                }
              })}>
                {activateOnProjectSwitchOptions.map(item=>(
                  <option key={convertBoolToStr(item.val)} value={convertBoolToStr(item.val)}>{item.name}</option>
                ))}
              </select>
            </SettingBlock>
          </SettingBlock>
        </div>
      </SettingsScreen>)
    } else {
      return null;
    }
  }

  return memo(ApplicationSettings);
}

export type ApplicationSettingsComponent = ReturnType<typeof createApplicationSettingsComponent>;
