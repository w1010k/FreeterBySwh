/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { SettingBlock, SettingRow, SettingActions } from '@/widgets/appModules';
import { timerEndSoundFiles, timerEndSoundFilesById } from '@/widgets/timer/audio/timer-end';
import { playSvg } from '@/widgets/timer/icons';
import { useAudioFile } from '@/widgets/timer/useAudioFile';
import { useCallback } from 'react';

interface SelectOption<T> {
  value: T;
  label: string;
}

/** End sound choices shared by Timer and Pomodoro; `''` means no sound. */
export const endSoundOptions: SelectOption<string>[] = [
  {
    label: '(No Sound)',
    value: ''
  },
  ...timerEndSoundFiles.map(item=>({
    label: item.name,
    value: item.id
  }))
];

const endSoundVolOptions: SelectOption<number>[] = [];
for (let vol = 0; vol <= 100; vol += 10) {
  endSoundVolOptions.push({
    label: vol + '%',
    value: vol
  });
}

/** The settings fields this block reads and writes. */
interface EndSoundFields {
  endSound: string;
  endSoundVol: number;
}

interface EndSoundSettingsProps<S extends EndSoundFields> {
  /** Prefix for the control ids (`<prefix>-endSound`, `<prefix>-endSoundVol`), so each widget keeps its own ids. */
  idPrefix: string;
  settings: S;
  updateSettings: (settings: S) => void;
}

/**
 * The "End Sound" and "End Sound Volume" setting blocks, shared by Timer and Pomodoro
 * so both widgets show the same titles, the same volume list, and the Test Sound button
 * next to the sound picker.
 */
export function EndSoundSettings<S extends EndSoundFields>({idPrefix, settings, updateSettings}: EndSoundSettingsProps<S>) {
  const endSound = useAudioFile(timerEndSoundFilesById[settings.endSound]?.path || '', settings.endSoundVol);
  const testSoundAction = useCallback(async () => { endSound.play(); }, [endSound]);

  return (
    <>
      <SettingBlock
        titleForId={`${idPrefix}-endSound`}
        title='End Sound'
        moreInfo='The sound to play when the countdown ends. Use the play button to test it.'
      >
        <SettingRow>
          <select id={`${idPrefix}-endSound`} value={settings.endSound} onChange={e => updateSettings({ ...settings, endSound: e.target.value })}>
            {endSoundOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <SettingActions actions={[{ id: 'TEST-SOUND', icon: playSvg, title: 'Test Sound', doAction: testSoundAction }]} />
        </SettingRow>
      </SettingBlock>

      <SettingBlock titleForId={`${idPrefix}-endSoundVol`} title='End Sound Volume' moreInfo='The playback volume of the end sound.'>
        <select id={`${idPrefix}-endSoundVol`} value={settings.endSoundVol} onChange={e => {
          // Check for NaN instead of `|| fallback`: 0% is a valid choice and is falsy.
          const vol = Number(e.target.value);
          updateSettings({ ...settings, endSoundVol: Number.isNaN(vol) ? settings.endSoundVol : vol });
        }}>
          {endSoundVolOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </SettingBlock>
    </>
  );
}
