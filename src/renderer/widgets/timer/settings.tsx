/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { CreateSettingsState, ReactComponent, SettingsEditorReactComponentProps, SettingBlock } from '@/widgets/appModules';
import { glockenspielArpeggioId } from '@/widgets/timer/audio/timer-end';
import { EndSoundSettings, endSoundOptions } from '@/widgets/timer/endSoundSettings';

export interface Settings {
  mins: number;
  endDesktop: boolean;
  endSound: string;
  endSoundVol: number;
}

interface SelectOption<T> {
  value: T;
  label: string;
}

const timerMinsOptions: SelectOption<number>[] = [];
for (let mins = 5; mins <= 90; mins += 5) {
  timerMinsOptions.push({
    label: mins + ' minutes',
    value: mins
  });
}

const endSoundValues = endSoundOptions.map(item=>item.value);
function isEndSoundValue(val: unknown): val is string {
  if (typeof val !== 'string') {
    return false;
  }

  if (endSoundValues.indexOf(val as string)>-1) {
    return true;
  }

  return false;
}
const defaultEndSound = glockenspielArpeggioId;

export const createSettingsState: CreateSettingsState<Settings> = (settings) => ({
  mins: typeof settings.mins === 'number' ? settings.mins : 25,
  endDesktop: typeof settings.endDesktop === 'boolean' ? settings.endDesktop : true,
  endSound: isEndSoundValue(settings.endSound) ? settings.endSound : defaultEndSound,
  endSoundVol: typeof settings.endSoundVol === 'number' ? settings.endSoundVol : 70,
})

function SettingsEditorComp({settings, settingsApi}: SettingsEditorReactComponentProps<Settings>) {
  const {updateSettings} = settingsApi;

  return (
    <>
      <SettingBlock
        titleForId='timer-mins'
        title='Timer'
        moreInfo='How long the countdown runs.'
      >
        <select id="timer-mins" value={settings.mins} onChange={e => {
          updateSettings({
            ...settings,
            mins: Number(e.target.value) || 5
          })
        }}>
          {
            timerMinsOptions.map(opt=>(
              <option
                key={opt.value}
                value={opt.value}
              >
                {opt.label}
              </option>
            ))
          }
        </select>
      </SettingBlock>

      <SettingBlock
        titleForId='timer-endDesktop'
        title='Desktop Notification'
        moreInfo='Show an OS notification when the countdown ends.'
      >
        <label>
          <input
            id="timer-endDesktop"
            type="checkbox"
            checked={settings.endDesktop}
            onChange={e => updateSettings({
              ...settings,
              endDesktop: e.target.checked
            })}
          /> Show a desktop notification when the timer ends
        </label>
      </SettingBlock>

      <EndSoundSettings idPrefix='timer' settings={settings} updateSettings={updateSettings} />

    </>
  )
}

export const settingsEditorComp: ReactComponent<SettingsEditorReactComponentProps<Settings>> = {
  type: 'react',
  Comp: SettingsEditorComp
}
