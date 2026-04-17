/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { CreateSettingsState, EntityId, ReactComponent, SettingBlock, SettingsEditorReactComponentProps, getEntitiesArrayFromEntityCollection } from '@/widgets/appModules';
import { useState } from 'react';

const noteWidgetType = 'note';
// Sentinel values used only as the <select>'s `value` for non-key options.
// They are guaranteed not to collide with entity ids because SharedDataKey ids
// are uuidv4 strings — no leading underscores.
const UNSHARED = '__unshared__';
const CREATE_NEW = '__new__';

export interface Settings {
  spellCheck: boolean;
  markdown: boolean;
  sharedKeyId: EntityId | null;
}

export const createSettingsState: CreateSettingsState<Settings> = (settings) => ({
  spellCheck: typeof settings.spellCheck === 'boolean' ? settings.spellCheck : false,
  markdown: typeof settings.markdown === 'boolean' ? settings.markdown : false,
  sharedKeyId: typeof settings.sharedKeyId === 'string' && settings.sharedKeyId.length > 0 ? settings.sharedKeyId : null,
})

function SettingsEditorComp({settings, settingsApi, sharedState}: SettingsEditorReactComponentProps<Settings>) {
  const {updateSettings} = settingsApi;
  const allKeys = getEntitiesArrayFromEntityCollection(sharedState.sharedDataKeys.sharedDataKeys);
  const keysOfThisType = allKeys.filter(k => k.widgetType === noteWidgetType);

  const [isCreating, setIsCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');

  const selectValue = settings.sharedKeyId ?? UNSHARED;

  const onSelectChange = (value: string) => {
    if (value === CREATE_NEW) {
      setIsCreating(true);
      setNewKeyName('');
      return;
    }
    setIsCreating(false);
    if (value === UNSHARED) {
      updateSettings({ ...settings, sharedKeyId: null });
    } else {
      updateSettings({ ...settings, sharedKeyId: value });
    }
  };

  const onCreateConfirm = () => {
    const trimmed = newKeyName.trim();
    if (!trimmed) return;
    const id = settingsApi.sharedDataKey.create(noteWidgetType, trimmed);
    updateSettings({ ...settings, sharedKeyId: id });
    setIsCreating(false);
    setNewKeyName('');
  };

  const onCreateCancel = () => {
    setIsCreating(false);
    setNewKeyName('');
  };

  const onDeleteSelected = () => {
    const id = settings.sharedKeyId;
    if (!id) return;
    settingsApi.sharedDataKey.delete(id);
  };

  return (
    <>
      <SettingBlock
        titleForId='note-spell-check'
        title='Spell Checker'
      >
        <div>
          <label>
            <input type="checkbox" id="note-spell-check" checked={settings.spellCheck} onChange={_=>updateSettings({
              ...settings,
              spellCheck: !settings.spellCheck
            })}/>
            Enable spell checking
          </label>
        </div>
      </SettingBlock>

      <SettingBlock
        titleForId='markdown'
        title='Markdown'
      >
        <div>
          <label>
            <input type="checkbox" id="markdown" checked={settings.markdown} onChange={_=>updateSettings({
              ...settings,
              markdown: !settings.markdown
            })}/>
            Enable Markdown
          </label>
        </div>
      </SettingBlock>

      <SettingBlock
        titleForId='note-shared-key-select'
        title='Shared Data'
        moreInfo='Assign a shared key so other Note widgets in any workflow can sync their content with this one. Switching keys replaces this widget&apos;s visible content with the selected key&apos;s content; the previous per-widget content is kept and restored when you switch back to "Not shared".'
      >
        <div>
          <select
            id='note-shared-key-select'
            value={selectValue}
            onChange={e => onSelectChange(e.target.value)}
          >
            <option value={UNSHARED}>Not shared (per-widget data)</option>
            {keysOfThisType.map(k => (
              <option key={k.id} value={k.id}>{k.name}</option>
            ))}
            <option value={CREATE_NEW}>+ Create new key…</option>
          </select>
          {settings.sharedKeyId && (
            <>
              {' '}
              <button
                type='button'
                onClick={onDeleteSelected}
                title='Delete this shared key (also erases its content)'
              >Delete key</button>
            </>
          )}
        </div>
        {isCreating && (
          <div style={{ marginTop: '0.5em' }}>
            <input
              type='text'
              placeholder='Key name (e.g. Shopping list)'
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); onCreateConfirm(); }
                else if (e.key === 'Escape') { e.preventDefault(); onCreateCancel(); }
              }}
              autoFocus
            />
            {' '}
            <button type='button' onClick={onCreateConfirm} disabled={!newKeyName.trim()}>Create</button>
            {' '}
            <button type='button' onClick={onCreateCancel}>Cancel</button>
          </div>
        )}
      </SettingBlock>
    </>
  )
}

export const settingsEditorComp: ReactComponent<SettingsEditorReactComponentProps<Settings>> = {
  type: 'react',
  Comp: SettingsEditorComp
}
