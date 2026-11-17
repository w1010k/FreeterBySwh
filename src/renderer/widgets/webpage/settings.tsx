/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Button, CreateSettingsState, SettingsEditorReactComponentProps, ReactComponent, SettingBlock, SettingRow, SettingActions, arrDown14Svg, arrUp14Svg, delete14Svg } from '@/widgets/appModules';
import { debounce } from '@common/helpers/debounce';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActionBarLayout, arrangeActions, sanitizeActionBarLayout } from './actionLayout';
import { BuiltinActionInfo, builtinActionsAfterCustom, builtinActionsBeforeCustom, customActionItemId, customActionItemIdPrefix } from './actionBar';
import { actionPresets } from './actionPresets';
import styles from './settings.module.scss';

const settingsSessionScopes = ['app', 'prj', 'wfl', 'wgt'] as const;
export type SettingsSessionScope = typeof settingsSessionScopes[number];
function isSettingsSessionScope(val: unknown): val is SettingsSessionScope {
  if (typeof val !== 'string') {
    return false;
  }

  if (settingsSessionScopes.indexOf(val as SettingsSessionScope)>-1) {
    return true;
  }

  return false;
}

const settingsSessionPersist = ['persist', 'temp'] as const;
export type SettingsSessionPersist = typeof settingsSessionPersist[number];
function isSettingsSessionPersist(val: unknown): val is SettingsSessionPersist {
  if (typeof val !== 'string') {
    return false;
  }

  if (settingsSessionPersist.indexOf(val as SettingsSessionPersist)>-1) {
    return true;
  }

  return false;
}

export interface TabSettings {
  url: string;
  name: string;
}

function sanitizeTabSetting(val: unknown): TabSettings | null {
  if (typeof val === 'string') {
    // legacy format (pre object-tabs): plain url, optionally 'url | name'
    const sep = val.indexOf('|');
    if (sep < 0) {
      return { url: val.trim(), name: '' };
    }
    return { url: val.slice(0, sep).trim(), name: val.slice(sep + 1).trim() };
  }
  if (typeof val === 'object' && val !== null) {
    const { url, name } = val as { url?: unknown; name?: unknown };
    return {
      url: typeof url === 'string' ? url : '',
      name: typeof name === 'string' ? name : ''
    };
  }
  return null;
}

export interface CustomActionSettings {
  id: string;
  name: string;
  js: string;
}

let customActionIdCounter = 0;
function genCustomActionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  customActionIdCounter += 1;
  return `a${Date.now()}-${customActionIdCounter}`;
}

// Actions saved before the Actions list (CHANGES #115) have no id; they get one here, and it
// is saved with the next state save. A repeated id (hand-edited data, an AI agent) gets a new one.
function sanitizeCustomAction(val: unknown, usedIds: Set<string>): CustomActionSettings | null {
  if (typeof val !== 'object' || val === null) {
    return null;
  }
  const { id, name, js } = val as { id?: unknown; name?: unknown; js?: unknown };
  const validId = typeof id === 'string' && id !== '' && !usedIds.has(id) ? id : genCustomActionId();
  usedIds.add(validId);
  return {
    id: validId,
    name: typeof name === 'string' ? name : '',
    js: typeof js === 'string' ? js : ''
  };
}

// A row of the Actions setting: a built-in button or a custom action.
type ActionEntry =
  | { id: string; info: BuiltinActionInfo; custom?: undefined }
  | { id: string; info?: undefined; custom: { action: CustomActionSettings; index: number } };

export interface Settings {
  autoReload: number;
  sessionPersist: SettingsSessionPersist;
  sessionScope: SettingsSessionScope;
  url: string;
  urlName: string;
  tabs: TabSettings[];
  customActions: CustomActionSettings[];
  actionBar: ActionBarLayout;
  injectedCSS: string;
  injectedJS: string;
  userAgent: string;
}

export const createSettingsState: CreateSettingsState<Settings> = (settings) => {
  // Settings saved before urlName existed may carry a legacy 'url | name' in the
  // url field; split it once. Settings saved with urlName never get re-parsed,
  // so urls containing a literal pipe stay intact from then on.
  const legacyUrl = typeof settings.urlName !== 'string' && typeof settings.url === 'string'
    ? sanitizeTabSetting(settings.url)
    : null;
  const customActionIds = new Set<string>();
  const customActions = Array.isArray(settings.customActions)
    ? settings.customActions.map(a => sanitizeCustomAction(a, customActionIds)).filter((a): a is CustomActionSettings => a !== null)
    : [];
  // Drops the ids of custom actions that no longer exist (an AI agent that rewrites customActions
  // without ids gives them new ones), so the saved lists hold only live ids.
  const liveCustomItemIds = new Set(customActions.map(customActionItemId));
  const isLive = (id: string) => !id.startsWith(customActionItemIdPrefix) || liveCustomItemIds.has(id);
  const actionBar = sanitizeActionBarLayout(settings.actionBar);
  return {
    autoReload: typeof settings.autoReload === 'number' ? settings.autoReload : 0,
    sessionPersist: isSettingsSessionPersist(settings.sessionPersist) ? settings.sessionPersist : 'persist',
    sessionScope: isSettingsSessionScope(settings.sessionScope) ? settings.sessionScope : 'prj',
    url: legacyUrl ? legacyUrl.url : (typeof settings.url === 'string' ? settings.url : ''),
    urlName: typeof settings.urlName === 'string' ? settings.urlName : (legacyUrl?.name ?? ''),
    tabs: Array.isArray(settings.tabs)
      ? settings.tabs.map(sanitizeTabSetting).filter((t): t is TabSettings => t !== null)
      : [],
    customActions,
    actionBar: { hidden: actionBar.hidden.filter(isLive), order: actionBar.order.filter(isLive) },
    injectedCSS: typeof settings.injectedCSS === 'string' ? settings.injectedCSS : '',
    injectedJS: typeof settings.injectedJS === 'string' ? settings.injectedJS : '',
    userAgent: typeof settings.userAgent === 'string' ? settings.userAgent : '',
  };
}

const debounceUpdate3s = debounce((fn: () => void) => fn(), 3000);

// Text settings that mirror their value in local state and write to settings debounced (3s)
// while typing, immediately on blur. The three fields share one debounce instance so switching
// fields flushes the previous one via blur — keep that behavior when changing this.
type DebouncedTextField = 'url' | 'urlName' | 'injectedJS' | 'userAgent';

function useDebouncedTextSettingUpdater(
  field: DebouncedTextField,
  setLocalValue: (val: string) => void,
  settings: Settings,
  updateSettings: (settings: Settings) => void
) {
  return useCallback((newVal: string, shouldDebounce: boolean) => {
    setLocalValue(newVal);
    const updateValInSettings = () => updateSettings({
      ...settings,
      [field]: newVal
    })
    if (shouldDebounce) {
      debounceUpdate3s(updateValInSettings);
    } else {
      debounceUpdate3s.cancel();
      updateValInSettings();
    }
  }, [field, setLocalValue, settings, updateSettings])
}

export function SettingsEditorComp({settings, settingsApi}: SettingsEditorReactComponentProps<Settings>) {
  const {updateSettings} = settingsApi;

  // The debounce instance is module-wide. Drop a pending write when the editor
  // closes, so it can't land in the next Webpage widget's settings modal.
  useEffect(() => () => debounceUpdate3s.cancel(), []);

  const [url, setUrl] = useState(settings.url);
  const [urlName, setUrlName] = useState(settings.urlName);
  // Tab url/name edits mirror local state and write debounced (3s), immediately
  // on blur — same debounce instance as the text fields below, so switching
  // fields flushes the pending write. Typing a tab url live would otherwise
  // reload its webview on every keystroke.
  const [tabs, setTabs] = useState(settings.tabs);
  const updateTabs = useCallback((newTabs: TabSettings[], shouldDebounce: boolean) => {
    setTabs(newTabs);
    const updateValInSettings = () => updateSettings({
      ...settings,
      tabs: newTabs
    })
    if (shouldDebounce) {
      debounceUpdate3s(updateValInSettings);
    } else {
      debounceUpdate3s.cancel();
      updateValInSettings();
    }
  }, [settings, updateSettings])
  const updTab = (i: number, patch: Partial<TabSettings>, shouldDebounce: boolean) =>
    updateTabs(tabs.map((tab, _i) => i !== _i ? tab : { ...tab, ...patch }), shouldDebounce);
  const addTab = () => updateTabs([...tabs, { url: '', name: '' }], false);
  const deleteTab = (i: number) => updateTabs(tabs.filter((_tab, _i) => i !== _i), false);
  // Swaps a tab with its neighbor. The header tab bar follows this order; the
  // URL field above always stays the first tab, so it isn't part of the swap.
  const moveTab = (i: number, dir: -1 | 1) => {
    const newTabs = [...tabs];
    [newTabs[i], newTabs[i + dir]] = [newTabs[i + dir], newTabs[i]];
    updateTabs(newTabs, false);
  };

  // Actions: the built-in buttons and the custom action rows in one list. Custom action rows
  // follow the same mirror-and-debounce contract as the tab rows; the layout (shown, order)
  // goes in the same write and always saves at once.
  const [customActions, setCustomActions] = useState(settings.customActions);
  const updateActions = useCallback((
    newActions: CustomActionSettings[],
    newLayout: ActionBarLayout,
    shouldDebounce: boolean
  ) => {
    setCustomActions(newActions);
    const updateValInSettings = () => updateSettings({
      ...settings,
      customActions: newActions,
      actionBar: newLayout
    })
    if (shouldDebounce) {
      debounceUpdate3s(updateValInSettings);
    } else {
      debounceUpdate3s.cancel();
      updateValInSettings();
    }
  }, [settings, updateSettings])
  const layout = settings.actionBar;
  const actionEntries = arrangeActions<ActionEntry>([
    ...builtinActionsBeforeCustom.map(info => ({ id: info.id, info })),
    ...customActions.map((action, index) => ({ id: customActionItemId(action), custom: { action, index } })),
    ...builtinActionsAfterCustom.map(info => ({ id: info.id, info })),
  ], layout);
  const updAction = (i: number, patch: Partial<CustomActionSettings>, shouldDebounce: boolean) =>
    updateActions(customActions.map((a, _i) => i !== _i ? a : { ...a, ...patch }), layout, shouldDebounce);
  // With a saved order, a new action goes right after the last custom action (before Mute when
  // there is none), the place it gets in the default order. Without one, the default order puts it there.
  const addAction = (name = '', js = '') => {
    const action = { id: genCustomActionId(), name, js };
    let newLayout = layout;
    if (layout.order.length > 0) {
      const ids = actionEntries.map(entry => entry.id);
      const lastCustom = actionEntries.map(entry => !!entry.custom).lastIndexOf(true);
      const muteIdx = ids.indexOf('MUTE');
      const at = lastCustom >= 0 ? lastCustom + 1 : (muteIdx >= 0 ? muteIdx : ids.length);
      newLayout = { ...layout, order: [...ids.slice(0, at), customActionItemId(action), ...ids.slice(at)] };
    }
    updateActions([...customActions, action], newLayout, false);
  };
  // The preset select only picks; the button adds. On Windows a closed select fires change on
  // each arrow key, so adding on change would add a preset per key press.
  const [presetIdx, setPresetIdx] = useState('');
  // Drops the deleted action's id from the layout too, so the saved lists hold only live ids.
  const deleteAction = (i: number) => {
    const itemId = customActionItemId(customActions[i]);
    updateActions(customActions.filter((_a, _i) => i !== _i), {
      hidden: layout.hidden.filter(id => id !== itemId),
      order: layout.order.filter(id => id !== itemId)
    }, false);
  };
  const setActionShown = (itemId: string, shown: boolean) => updateActions(customActions, {
    ...layout,
    hidden: shown ? layout.hidden.filter(id => id !== itemId) : [...layout.hidden, itemId]
  }, false);
  // Saves the order of the whole list, so every row keeps its place from then on.
  const moveAction = (i: number, dir: -1 | 1) => {
    const ids = actionEntries.map(entry => entry.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    updateActions(customActions, { ...layout, order: ids }, false);
  };

  const tabUrlRefs = useRef<Array<HTMLInputElement | null>>([]);
  const shouldFocusLastTabRef = useRef(false);
  useLayoutEffect(() => {
    if (shouldFocusLastTabRef.current) {
      tabUrlRefs.current[tabs.length - 1]?.focus();
      shouldFocusLastTabRef.current = false;
    }
  }, [tabs.length]);
  const [injectedJs, setInjectedJs] = useState(settings.injectedJS);
  const [userAgent, setUserAgent] = useState(settings.userAgent);
  const updateUrl = useDebouncedTextSettingUpdater('url', setUrl, settings, updateSettings);
  const updateUrlName = useDebouncedTextSettingUpdater('urlName', setUrlName, settings, updateSettings);
  const updateInjectedJs = useDebouncedTextSettingUpdater('injectedJS', setInjectedJs, settings, updateSettings);
  const updateUserAgent = useDebouncedTextSettingUpdater('userAgent', setUserAgent, settings, updateSettings);
  return (
    <>
      <SettingBlock
        titleForId='webpage-url'
        title='URL'
        moreInfo='Type a URL of a webpage or a web app to open in the widget. The tab name is used when the widget shows
                  multiple tabs; leave it empty to use the page title.'
      >
        <SettingRow>
          <input id="webpage-url" type="text" style={{flex: 2}} value={url} onChange={e => updateUrl(e.target.value, true)} onBlur={e=>updateUrl(e.target.value, false)} placeholder="https://example.com" />
          <input type="text" style={{flex: 1}} aria-label='Tab Name' value={urlName} onChange={e => updateUrlName(e.target.value, true)} onBlur={e=>updateUrlName(e.target.value, false)} placeholder="Tab name (optional)" />
        </SettingRow>
      </SettingBlock>

      <SettingBlock
        titleForId='webpage-tab-url0'
        title='Tabs'
        moreInfo='Add more URLs to show multiple webpages as switchable tabs in the widget header. The URL above becomes
                  the first tab. Each tab can have an optional name; without one, the page title is used.'
      >
        {tabs.map((tab, i) => (
          <SettingRow key={i}>
            <input
              ref={el => {tabUrlRefs.current[i] = el}}
              id={'webpage-tab-url' + i}
              type="text"
              style={{flex: 2}}
              aria-label={'Tab URL ' + (i + 1)}
              value={tab.url}
              placeholder='https://example.com'
              onChange={e => updTab(i, { url: e.target.value }, true)}
              onBlur={e => updTab(i, { url: e.target.value }, false)}
            />
            <input
              type="text"
              style={{flex: 1}}
              aria-label={'Tab Name ' + (i + 1)}
              value={tab.name}
              placeholder='Tab name (optional)'
              onChange={e => updTab(i, { name: e.target.value }, true)}
              onBlur={e => updTab(i, { name: e.target.value }, false)}
            />
            <SettingActions
              actions={[{
                id: 'MOVE-UP',
                icon: arrUp14Svg,
                title: 'Move Up',
                enabled: i > 0,
                doAction: async () => moveTab(i, -1)
              }, {
                id: 'MOVE-DOWN',
                icon: arrDown14Svg,
                title: 'Move Down',
                enabled: i < tabs.length - 1,
                doAction: async () => moveTab(i, 1)
              }, {
                id: 'DELETE',
                icon: delete14Svg,
                title: 'Delete Tab',
                doAction: async () => deleteTab(i)
              }]}
            />
          </SettingRow>
        ))}
        <div>
          <Button
            onClick={_ => {
              addTab();
              shouldFocusLastTabRef.current = true;
            }}
            caption='Add Tab'
            primary={true}
          ></Button>
        </div>
      </SettingBlock>

      <SettingBlock
        titleForId='webpage-action-preset'
        title='Actions'
        moreInfo='The buttons in the widget action bar. Clear a checkbox to hide a button, and use the arrows to change
                  the order. A custom action runs a JavaScript snippet on the current page when clicked, like a browser
                  bookmarklet. Add an empty one, or choose a preset and add it.'
      >
        {actionEntries.map((entry, i) => {
          const moveActions = [{
            id: 'MOVE-UP',
            icon: arrUp14Svg,
            title: 'Move Up',
            enabled: i > 0,
            doAction: async () => moveAction(i, -1)
          }, {
            id: 'MOVE-DOWN',
            icon: arrDown14Svg,
            title: 'Move Down',
            enabled: i < actionEntries.length - 1,
            doAction: async () => moveAction(i, 1)
          }];
          const showId = 'webpage-action-show' + i;
          const shown = !layout.hidden.includes(entry.id);
          if (entry.custom) {
            const { action, index } = entry.custom;
            return (
              <SettingRow key={entry.id}>
                <input
                  id={showId}
                  type="checkbox"
                  aria-label={'Show Action ' + (index + 1)}
                  checked={shown}
                  onChange={e => setActionShown(entry.id, e.target.checked)}
                />
                <input
                  type="text"
                  style={{flex: 1}}
                  aria-label={'Action Name ' + (index + 1)}
                  value={action.name}
                  placeholder='Name'
                  onChange={e => updAction(index, { name: e.target.value }, true)}
                  onBlur={e => updAction(index, { name: e.target.value }, false)}
                />
                <input
                  type="text"
                  style={{flex: 2}}
                  aria-label={'Action JS ' + (index + 1)}
                  value={action.js}
                  placeholder='JavaScript code'
                  onChange={e => updAction(index, { js: e.target.value }, true)}
                  onBlur={e => updAction(index, { js: e.target.value }, false)}
                />
                <SettingActions
                  actions={[...moveActions, {
                    id: 'DELETE',
                    icon: delete14Svg,
                    title: 'Delete Action',
                    doAction: async () => deleteAction(index)
                  }]}
                />
              </SettingRow>
            );
          }
          const { info } = entry;
          return (
            <SettingRow key={entry.id} className={styles['builtin-row']}>
              <label className={styles['action-label']}>
                <input
                  id={showId}
                  type="checkbox"
                  checked={shown}
                  onChange={e => setActionShown(entry.id, e.target.checked)}
                /> {info.label}{info.note && <span className={styles['action-note']}> ({info.note})</span>}
              </label>
              <SettingActions actions={moveActions} />
            </SettingRow>
          );
        })}
        <SettingRow className={styles['preset-row']}>
          <Button
            onClick={_ => addAction()}
            caption='Add Action'
            primary={true}
          ></Button>
          <select
            id='webpage-action-preset'
            aria-label='Preset'
            className={styles['preset-select']}
            value={presetIdx}
            onChange={e => setPresetIdx(e.target.value)}
          >
            <option value='' disabled>Choose a preset…</option>
            {actionPresets.map((preset, i) => <option key={preset.name} value={i}>{preset.name}</option>)}
          </select>
          <Button
            onClick={_ => {
              const preset = actionPresets[Number(presetIdx)];
              if (presetIdx !== '' && preset) {
                addAction(preset.name, preset.js);
                setPresetIdx('');
              }
            }}
            caption='Add Preset'
            disabled={presetIdx === ''}
          ></Button>
        </SettingRow>
      </SettingBlock>

      <SettingBlock
        titleForId='webpage-session-scope'
        title='Session Scope'
        moreInfo='When you log in to a website, the widget stores the data in a session to keep you logged in. Session scope
                  specifies how the session data should be shared between webpage widgets. By default, the Application scope
                  is set. This scope shares the session data between all webpage widgets. It enables you to login to a
                  website with one webpage widget and use the same account in all webpage widgets that have the Application
                  scope. However sometimes you may need to access a webpage using different accounts. For example, if your
                  project depends on multiple social media accounts, a narrower scope would be a better fit. Project Scope
                  will share the data between widgets within the same project. Workflow Scope - between widgets within the
                  same workflow tab. Widget Scope will not share the session data with other webpage widgets.'
      >
        <select id="webpage-session-scope" value={settings.sessionScope} onChange={e => updateSettings({
          ...settings,
          sessionScope: isSettingsSessionScope(e.target.value) ? e.target.value : 'prj'
        })}>
          <option value="app">Application</option>
          <option value="prj">Project</option>
          <option value="wfl">Workflow</option>
          <option value="wgt">Widget</option>
        </select>
      </SettingBlock>

      <SettingBlock
        titleForId='webpage-session-persistence'
        title='Session Persistence'
        moreInfo='By default, the widget will persist the session data after you exit the application. Set the Temporary mode to clear the session data on exit.'
      >
        <select id="webpage-session-persistence" value={settings.sessionPersist} onChange={e => updateSettings({
          ...settings,
          sessionPersist: isSettingsSessionPersist(e.target.value) ? e.target.value : 'persist'
        })}>
          <option value="persist">Persistent</option>
          <option value="temp">Temporary</option>
        </select>
      </SettingBlock>

      <SettingBlock
        titleForId='webpage-auto-reload'
        title='Auto-Reload'
        moreInfo="If you need to automatically refresh the webpage, use this option to set the auto-reload interval."
      >
        <select id="webpage-auto-reload" value={settings.autoReload} onChange={e => updateSettings({
          ...settings,
          autoReload: Number.parseInt(e.target.value) || 0
        })}>
          <option value="0">Disabled</option>
          <option value="10">10 Seconds</option>
          <option value="30">30 Seconds</option>
          <option value="60">1 Minute</option>
          <option value="300">5 Minutes</option>
          <option value="600">10 Minutes</option>
          <option value="3600">60 Minutes</option>
        </select>
      </SettingBlock>

      <SettingBlock
        titleForId='webpage-inject-css'
        title='Inject CSS'
        moreInfo='Inject the following CSS style into the webpage.'
      >
        <textarea id="webpage-inject-css" value={settings.injectedCSS} onChange={e => updateSettings({...settings, injectedCSS: e.target.value})} placeholder="e.g. body { font-size: 16px; }"></textarea>
      </SettingBlock>

      <SettingBlock
        titleForId='webpage-inject-js'
        title='Inject JS'
        moreInfo='Inject the following JS script into the webpage.'
      >
        <textarea id="webpage-inject-js" value={injectedJs} onChange={e => updateInjectedJs(e.target.value, true)} onBlur={e=>updateInjectedJs(e.target.value, false)} placeholder="e.g. document.querySelector('header')?.remove();"></textarea>
      </SettingBlock>

      <SettingBlock
        titleForId='webpage-user-agent'
        title='User Agent'
        moreInfo='Set the following User Agent string for the webpage.'
      >
        <input id="webpage-user-agent" type="text" value={userAgent} onChange={e => updateUserAgent(e.target.value, true)} onBlur={e=>updateUserAgent(e.target.value, false)} placeholder="e.g. Mozilla/5.0 (Windows NT 10.0; Win64; x64)" />
      </SettingBlock>
    </>
  )
}

export const settingsEditorComp: ReactComponent<SettingsEditorReactComponentProps<Settings>> = {
  type: 'react',
  Comp: SettingsEditorComp
}
