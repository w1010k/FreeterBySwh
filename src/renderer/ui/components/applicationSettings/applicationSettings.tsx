/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {workflowBarMaxWidth, workflowBarMinWidth} from '@/application/useCases/applicationSettings/setWorkflowBarWidth';
import {MergedTopBarSide} from '@/base/appConfig';
import {convertBoolToStr, convertStrToBool} from '@/base/convTypes';
import {ApplicationSettingsViewModelHook} from '@/ui/components/applicationSettings/applicationSettingsViewModel';
import {SettingsScreen} from '@/ui/components/basic/settingsScreen/settingsScreen';
import settingsScreenStyles from '@/ui/components/basic/settingsScreen/settingsScreen.module.scss'
import clsx from 'clsx';
import {memo, useState} from 'react';
import styles from './applicationSettings.module.scss';

/**
 * Width input for the side workflow bar. Keeps the raw text while typing so
 * intermediate values ("3" on the way to "300") aren't clamped away under the
 * cursor; only in-range values reach the settings live, and blur snaps the text
 * to the clamped value. Clicking OK blurs the field first, so an out-of-range
 * entry is never saved.
 */
function WorkflowBarWidthInput({id, value, onChange}: { id: string; value: number; onChange: (width: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const inRange = (n: number) => n >= workflowBarMinWidth && n <= workflowBarMaxWidth;
  return (
    <input
      id={id}
      type="number"
      aria-label="Workflow bar width"
      min={workflowBarMinWidth}
      max={workflowBarMaxWidth}
      step={10}
      value={draft}
      onChange={e => {
        setDraft(e.target.value);
        const n = Number.parseInt(e.target.value);
        if (inRange(n)) {
          onChange(n);
        }
      }}
      onBlur={() => {
        const n = Number.parseInt(draft);
        const committed = Number.isNaN(n) ? value : Math.min(workflowBarMaxWidth, Math.max(workflowBarMinWidth, n));
        setDraft(String(committed));
        if (committed !== value) {
          onChange(committed);
        }
      }}
    />
  );
}

/** The id of a setting's description, which its control names in `aria-describedby`. */
const descId = (id: string) => `${id}-desc`;

function Section({id, title, children}: React.PropsWithChildren<{ id: string; title: string }>) {
  return (
    <section className={styles['section']} aria-labelledby={id}>
      <h3 id={id} className={styles['section-title']}>{title}</h3>
      {children}
    </section>
  );
}

/**
 * One setting: its name and description on the left, its control on the right. `wide` puts the control under the
 * text across the row (path fields with buttons); `sub` marks an option of the setting above it.
 */
function Row({id, title, desc, wide, sub, children}: React.PropsWithChildren<{
  id: string;
  title: string;
  desc?: string;
  wide?: boolean;
  sub?: boolean;
}>) {
  return (
    <div className={clsx(styles['row'], wide && styles['is-wide'], sub && styles['is-sub'])}>
      <div className={styles['row-text']}>
        <label htmlFor={id} className={styles['row-label']}>{title}</label>
        {desc && <div id={descId(id)} className={styles['row-desc']}>{desc}</div>}
      </div>
      <div className={styles['row-control']}>{children}</div>
    </div>
  );
}

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
      return (
        <SettingsScreen title='Application Settings' onOkClick={onOkClickHandler} onCancelClick={onCancelClickHandler}>
          <div className={clsx(settingsScreenStyles['settings-screen-panel'], styles['settings-editor'])}>
            <div className={styles['settings-content']}>

              <Section id='settings-section-appearance' title='Appearance'>
                <Row
                  id='ui-theme'
                  title='User Interface Theme'
                  desc='The interface theme defines the appearance of all visual elements of the user interface. System follows the light/dark mode of the OS. Ctrl+Shift+L (Cmd+Shift+L on macOS) switches between a light and a dark theme.'
                >
                  <select id="ui-theme" aria-describedby={descId('ui-theme')} value={appConfig.uiTheme} onChange={e => updateSettings({
                    ...appConfig,
                    uiTheme: e.target.value
                  })}>
                    {uiThemeOptions.map(item => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </Row>

                <Row
                  id='workflow-bar-pos'
                  title='Workflow Bar Position'
                  desc='Where the workflow tab bar sits. Left/Right show it as a vertical side panel whose width you can set here (or drag its edge while in Edit Mode). At the top, it can take in the Top Bar (when shown), with the Top Bar widgets on either side of the workflow tabs.'
                >
                  <select id="workflow-bar-pos" aria-describedby={descId('workflow-bar-pos')} value={appConfig.workflowBarPos} onChange={e => updateSettings({
                    ...appConfig,
                    workflowBarPos: e.target.value as typeof appConfig.workflowBarPos
                  })}>
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                </Row>
                {(appConfig.workflowBarPos === 'left' || appConfig.workflowBarPos === 'right') &&
                  <Row id='workflow-bar-width' title='Width' sub>
                    <div className={styles['control-line']}>
                      <WorkflowBarWidthInput
                        id='workflow-bar-width'
                        value={appConfig.workflowBarWidth}
                        onChange={workflowBarWidth => updateSettings({
                          ...appConfig,
                          workflowBarWidth
                        })}
                      />
                      <span className={styles['unit']}>px</span>
                    </div>
                  </Row>}
                {appConfig.workflowBarPos === 'top' &&
                  <Row
                    id='merge-top-bar'
                    title='Merge Top Bar into it'
                    desc='Applies while the Top Bar is shown (View > Appearance).'
                    sub
                  >
                    {/* One choice for two settings: Off keeps the side, so turning the merge back on restores it. A side
                        other than 'left' shows as 'right', as the bar draws it (a hand-edited or unknown saved value). */}
                    <select id="merge-top-bar" aria-describedby={descId('merge-top-bar')}
                            value={appConfig.mergeTopBar ? (appConfig.mergedTopBarSide === 'left' ? 'left' : 'right') : 'off'}
                            onChange={e => updateSettings(e.target.value === 'off'
                              ? {...appConfig, mergeTopBar: false}
                              : {...appConfig, mergeTopBar: true, mergedTopBarSide: e.target.value as MergedTopBarSide})}>
                      <option value="off">Off</option>
                      <option value="right">On, widgets on the right</option>
                      <option value="left">On, widgets on the left</option>
                    </select>
                  </Row>}

                <Row
                  id='worktable-bg-color'
                  title='Workflow Background Color'
                  desc='Custom background color for the workflow area. Leave as default to use the theme color.'
                >
                  <div className={styles['control-line']}>
                    <input
                      id="worktable-bg-color"
                      type="color"
                      aria-describedby={descId('worktable-bg-color')}
                      value={appConfig.bgColor !== '' ? appConfig.bgColor : '#ffffff'}
                      onChange={e => updateSettings({...appConfig, bgColor: e.target.value})}
                    />
                    {appConfig.bgColor !== ''
                      ? <button type="button" onClick={() => updateSettings({...appConfig, bgColor: ''})}>Use default</button>
                      : <span className={styles['hint']}>Theme default</span>}
                  </div>
                </Row>

                <Row
                  id='worktable-bg-image'
                  title='Workflow Background Image'
                  desc='Optional image shown behind the widgets. Leave empty for no image.'
                  wide
                >
                  <div className={styles['control-line']}>
                    <input
                      id="worktable-bg-image"
                      type="text"
                      aria-describedby={descId('worktable-bg-image')}
                      value={appConfig.bgImage}
                      placeholder='No image'
                      onChange={e => updateSettings({...appConfig, bgImage: e.target.value})}
                    />
                    <button type="button" onClick={onBrowseBgImageHandler}>Browse…</button>
                    {appConfig.bgImage !== '' && <button type="button" onClick={onClearBgImageHandler}>Clear</button>}
                  </div>
                </Row>
                {appConfig.bgImage !== '' &&
                  <Row id='worktable-bg-image-mode' title='Background Image Fit' sub>
                    <select
                      id='worktable-bg-image-mode'
                      value={appConfig.bgImageMode}
                      onChange={e => updateSettings({
                        ...appConfig,
                        bgImageMode: e.target.value as typeof appConfig.bgImageMode
                      })}
                    >
                      <option value="cover">Fill (cover)</option>
                      <option value="contain">Fit (contain)</option>
                      <option value="center">Center</option>
                      <option value="tile">Tile</option>
                    </select>
                  </Row>}

                {(appConfig.bgColor !== '' || appConfig.bgImage !== '') &&
                  <Row
                    id='worktable-bg-opacity'
                    title='Workflow Background Opacity'
                    desc='Opacity of the custom background color/image. Lower values let the theme background show through.'
                  >
                    <div className={styles['control-line']}>
                      <input
                        id="worktable-bg-opacity"
                        type="range"
                        aria-describedby={descId('worktable-bg-opacity')}
                        min={0}
                        max={100}
                        step={5}
                        value={appConfig.bgOpacity}
                        onChange={e => updateSettings({...appConfig, bgOpacity: Number.parseInt(e.target.value)})}
                      />
                      <span className={styles['unit']}>{appConfig.bgOpacity}%</span>
                    </div>
                  </Row>}
              </Section>

              <Section id='settings-section-general' title='General'>
                <Row
                  id='main-hot-key'
                  title='Hotkey Combination'
                  desc='Hotkey enables you to bring AceDeck to the front of the screen by pressing the specified key combination.'
                >
                  <select id="main-hot-key" aria-describedby={descId('main-hot-key')} value={appConfig.mainHotkey} onChange={e => updateSettings({
                    ...appConfig,
                    mainHotkey: e.target.value
                  })}>
                    {hotkeyOptions.map(item => (
                      <option key={item.value} value={item.value}>{item.caption}</option>
                    ))}
                  </select>
                </Row>

                <Row
                  id='download-dir'
                  title='Download Folder'
                  desc='Where files downloaded from Webpage widgets are saved. Leave empty to use the system default Downloads folder.'
                  wide
                >
                  <div className={styles['control-line']}>
                    <input
                      id="download-dir"
                      type="text"
                      aria-describedby={descId('download-dir')}
                      value={appConfig.downloadDir}
                      placeholder='Default (system Downloads folder)'
                      onChange={e => updateSettings({...appConfig, downloadDir: e.target.value})}
                    />
                    <button type="button" onClick={onBrowseDownloadDirHandler}>Browse…</button>
                    {appConfig.downloadDir !== '' &&
                      <button type="button" onClick={onResetDownloadDirHandler}>Use default</button>}
                  </div>
                </Row>

                <div className={styles['group']} role="group" aria-labelledby='mem-saver-title' aria-describedby={descId('mem-saver')}>
                  <div className={styles['row-text']}>
                    <div id='mem-saver-title' className={styles['row-label']}>Memory Saver</div>
                    <div id={descId('mem-saver')} className={styles['row-desc']}>
                      AceDeck frees up memory from inactive workflows. This gives active workflows more computer resources
                      and keeps AceDeck fast. Your inactive workflows automatically become active again when you go back to them.
                    </div>
                  </div>
                  <Row
                    id='mem-saver-inactive'
                    title='Workflow Becomes Inactive After'
                    desc='This setting defines when workflows become inactive.'
                    sub
                  >
                    <select id="mem-saver-inactive" aria-describedby={descId('mem-saver-inactive')} value={appConfig.memSaver.workflowInactiveAfter}
                            onChange={e => updateSettings({
                              ...appConfig,
                              memSaver: {
                                ...appConfig.memSaver,
                                workflowInactiveAfter: Number.parseInt(e.target.value)
                              }
                            })}>
                      {inactiveAfterOptions.map(item => (
                        <option key={item.val} value={item.val}>{item.name}</option>
                      ))}
                    </select>
                  </Row>
                  <Row
                    id='mem-saver-activate-on-project'
                    title='Activate All Workflows When Switching Project'
                    desc='When turned on, switching to a project will activate all of its workflows.'
                    sub
                  >
                    <select id="mem-saver-activate-on-project"
                            aria-describedby={descId('mem-saver-activate-on-project')}
                            value={convertBoolToStr(appConfig.memSaver.activateWorkflowsOnProjectSwitch)}
                            onChange={e => updateSettings({
                              ...appConfig,
                              memSaver: {
                                ...appConfig.memSaver,
                                activateWorkflowsOnProjectSwitch: convertStrToBool(e.target.value)
                              }
                            })}>
                      {activateOnProjectSwitchOptions.map(item => (
                        <option key={convertBoolToStr(item.val)} value={convertBoolToStr(item.val)}>{item.name}</option>
                      ))}
                    </select>
                  </Row>
                </div>
              </Section>

              <Section id='settings-section-privacy' title='Privacy & AI'>
                <Row
                  id='telemetry-enabled'
                  title='Usage Analytics (Local Only)'
                  desc='When on, AceDeck records how you use it — workflows opened and for how long, app
                        focus time, keystroke counts (never the keys themselves), and an activity timeline:
                        Web Query searches, visited page titles/URLs, opened files, completed to-dos. While
                        AceDeck is running it also tracks OS-wide activity: the foreground app + window title
                        you are in (for per-app time) and system idle/lock. Keystroke contents and note
                        contents are never recorded. Everything stays on this computer; nothing is ever
                        uploaded. View, export, and delete it anytime via View → Analytics (opens in your browser). Off by default.'
                >
                  <select id="telemetry-enabled" aria-describedby={descId('telemetry-enabled')} value={convertBoolToStr(appConfig.telemetry.enabled)}
                          onChange={e => updateSettings({
                            ...appConfig,
                            telemetry: {
                              ...appConfig.telemetry,
                              enabled: convertStrToBool(e.target.value)
                            }
                          })}>
                    <option value={convertBoolToStr(false)}>Off</option>
                    <option value={convertBoolToStr(true)}>On</option>
                  </select>
                </Row>

                <Row
                  id='ai-always-allow'
                  title='AI Actions: Always Allow'
                  desc='When on, changes an AI agent makes in AceDeck (widgets, notes, to-dos, workflows, projects,
                        app settings) run without the confirm box. Actions that can run programs or commands on this
                        computer (Commander, File Opener, File Explorer, Terminal, Link Opener, Web Query: running them, changing
                        their settings or adding them), changing the download folder, Webpage navigation, address, user agent, session and
                        injected script/CSS, and paths to other computers still ask.
                        Text the agent reads (a note, a page) can steer it, so turn this on only if you accept that. Off by default.'
                >
                  <select id="ai-always-allow" aria-describedby={descId('ai-always-allow')} value={convertBoolToStr(appConfig.aiAlwaysAllow)}
                          onChange={e => updateSettings({
                            ...appConfig,
                            aiAlwaysAllow: convertStrToBool(e.target.value)
                          })}>
                    <option value={convertBoolToStr(false)}>Off</option>
                    <option value={convertBoolToStr(true)}>On</option>
                  </select>
                </Row>
              </Section>

            </div>
          </div>
        </SettingsScreen>)
    } else {
      return null;
    }
  }

  return memo(ApplicationSettings);
}

export type ApplicationSettingsComponent = ReturnType<typeof createApplicationSettingsComponent>;
