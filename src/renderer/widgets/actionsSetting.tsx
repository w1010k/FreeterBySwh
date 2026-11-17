/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { useState } from 'react';
import { Button, SettingActions, SettingBlock, SettingRow, arrDown14Svg, arrUp14Svg, delete14Svg } from '@/widgets/appModules';
import { ActionBarLayout, arrangeActions } from './actionLayout';
import { BuiltinActionInfo, CustomAction, customActionItemId, genCustomActionId } from './customActions';
import styles from './actionsSetting.module.scss';

// A row of the Actions setting: a built-in button or a custom action.
type ActionEntry<K extends string> =
  | { id: string; info: BuiltinActionInfo; custom?: undefined }
  | { id: string; info?: undefined; custom: { action: CustomAction<K>; index: number } };

export interface ActionsSettingProps<K extends string> {
  /** Prefix of the element ids, e.g. 'webpage-action'. */
  idPrefix: string;
  moreInfo: string;
  /** The built-in buttons in the default order; custom actions go between the two lists. */
  builtinsBefore: readonly BuiltinActionInfo[];
  builtinsAfter: readonly BuiltinActionInfo[];
  /** The custom action field the widget runs, its accessible name ('Action JS' → 'Action JS 1') and its placeholder. */
  field: K;
  fieldLabel: string;
  fieldPlaceholder: string;
  presets: readonly ({ name: string } & Record<K, string>)[];
  customActions: CustomAction<K>[];
  layout: ActionBarLayout;
  /** Text typing passes shouldDebounce true, its blur and every other change false. */
  onChange: (customActions: CustomAction<K>[], layout: ActionBarLayout, shouldDebounce: boolean) => void;
}

// The built-in action bar buttons and the custom actions in one list: a checkbox shows or hides
// a button, the arrows set the order, and custom actions can be added (empty or from a preset),
// edited and deleted.
export function ActionsSetting<K extends string>({
  idPrefix, moreInfo, builtinsBefore, builtinsAfter, field, fieldLabel, fieldPlaceholder, presets, customActions, layout, onChange
}: ActionsSettingProps<K>) {
  const actionEntries = arrangeActions<ActionEntry<K>>([
    ...builtinsBefore.map(info => ({ id: info.id, info })),
    ...customActions.map((action, index) => ({ id: customActionItemId(action), custom: { action, index } })),
    ...builtinsAfter.map(info => ({ id: info.id, info })),
  ], layout);
  const updAction = (i: number, patch: Partial<CustomAction<K>>, shouldDebounce: boolean) =>
    onChange(customActions.map((a, _i) => i !== _i ? a : { ...a, ...patch }), layout, shouldDebounce);
  // With a saved order, a new action goes right after the last custom action (before the first
  // built-in that follows the custom actions when there is none), the place it gets in the default
  // order. Without one, the default order puts it there.
  const addAction = (name: string, value: string) => {
    const action = { id: genCustomActionId(), name, [field]: value } as CustomAction<K>;
    let newLayout = layout;
    if (layout.order.length > 0) {
      const ids = actionEntries.map(entry => entry.id);
      const lastCustom = actionEntries.map(entry => !!entry.custom).lastIndexOf(true);
      const afterIdx = builtinsAfter.length > 0 ? ids.indexOf(builtinsAfter[0].id) : -1;
      const at = lastCustom >= 0 ? lastCustom + 1 : (afterIdx >= 0 ? afterIdx : ids.length);
      newLayout = { ...layout, order: [...ids.slice(0, at), customActionItemId(action), ...ids.slice(at)] };
    }
    onChange([...customActions, action], newLayout, false);
  };
  // The preset select only picks; the button adds. On Windows a closed select fires change on
  // each arrow key, so adding on change would add a preset per key press.
  const [presetIdx, setPresetIdx] = useState('');
  // Drops the deleted action's id from the layout too, so the saved lists hold only live ids.
  const deleteAction = (i: number) => {
    const itemId = customActionItemId(customActions[i]);
    onChange(customActions.filter((_a, _i) => i !== _i), {
      hidden: layout.hidden.filter(id => id !== itemId),
      order: layout.order.filter(id => id !== itemId)
    }, false);
  };
  // The same customActions array: a widget that redraws its action bar on a new array does not for a layout change.
  const setActionShown = (itemId: string, shown: boolean) => onChange(customActions, {
    ...layout,
    hidden: shown ? layout.hidden.filter(id => id !== itemId) : [...layout.hidden, itemId]
  }, false);
  // Saves the order of the whole list, so every row keeps its place from then on.
  const moveAction = (i: number, dir: -1 | 1) => {
    const ids = actionEntries.map(entry => entry.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    onChange(customActions, { ...layout, order: ids }, false);
  };

  // The title points at the preset select: a checkbox there would toggle when the title is clicked.
  const presetId = idPrefix + '-preset';
  return (
    <SettingBlock titleForId={presetId} title='Actions' moreInfo={moreInfo}>
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
        const showId = idPrefix + '-show' + i;
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
                onChange={e => updAction(index, { name: e.target.value } as Partial<CustomAction<K>>, true)}
                onBlur={e => updAction(index, { name: e.target.value } as Partial<CustomAction<K>>, false)}
              />
              <input
                type="text"
                style={{flex: 2}}
                aria-label={fieldLabel + ' ' + (index + 1)}
                value={action[field]}
                placeholder={fieldPlaceholder}
                onChange={e => updAction(index, { [field]: e.target.value } as Partial<CustomAction<K>>, true)}
                onBlur={e => updAction(index, { [field]: e.target.value } as Partial<CustomAction<K>>, false)}
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
          onClick={_ => addAction('', '')}
          caption='Add Action'
          primary={true}
        ></Button>
        <select
          id={presetId}
          aria-label='Preset'
          className={styles['preset-select']}
          value={presetIdx}
          onChange={e => setPresetIdx(e.target.value)}
        >
          <option value='' disabled>Choose a preset…</option>
          {presets.map((preset, i) => <option key={preset.name} value={i}>{preset.name}</option>)}
        </select>
        <Button
          onClick={_ => {
            const preset = presets[Number(presetIdx)];
            if (presetIdx !== '' && preset) {
              addAction(preset.name, preset[field]);
              setPresetIdx('');
            }
          }}
          caption='Add Preset'
          disabled={presetIdx === ''}
        ></Button>
      </SettingRow>
    </SettingBlock>
  );
}
