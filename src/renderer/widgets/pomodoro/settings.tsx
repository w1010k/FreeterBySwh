/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { CreateSettingsState, ReactComponent, SettingsEditorReactComponentProps, SettingBlock, SettingRow, SettingActions } from '@/widgets/appModules';
import { endSoundOptions } from '@/widgets/timer/settings';
import { glockenspielArpeggioId, timerEndSoundFilesById } from '@/widgets/timer/audio/timer-end';
import { playSvg } from '@/widgets/timer/icons';
import { useAudioFile } from '@/widgets/timer/useAudioFile';
import { useCallback } from 'react';

export interface Settings {
  workMins: number;
  breakMins: number;
  longBreakMins: number;
  /** A long break replaces the short one after every N work sessions; 0 = off. */
  longBreakEvery: number;
  endSound: string;
  endSoundVol: number;
}

const endSoundValues = endSoundOptions.map(o => o.value);
function isEndSoundValue(val: unknown): val is string {
  return typeof val === 'string' && endSoundValues.indexOf(val) > -1;
}

function minsOptions(from: number, to: number, step: number) {
  const opts: { value: number; label: string }[] = [];
  for (let m = from; m <= to; m += step) {
    opts.push({ value: m, label: `${m} minutes` });
  }
  return opts;
}
const workMinsOptions = minsOptions(5, 60, 5);
const breakMinsOptions = minsOptions(1, 30, 1);
const longBreakMinsOptions = minsOptions(5, 60, 5);
const longBreakEveryOptions = [
  { value: 0, label: '(No long breaks)' },
  ...[2, 3, 4, 5, 6].map(n => ({ value: n, label: `Every ${n} work sessions` }))
];
const volOptions = (() => {
  const opts: { value: number; label: string }[] = [];
  for (let v = 0; v <= 100; v += 10) {
    opts.push({ value: v, label: `${v}%` });
  }
  return opts;
})();

export const createSettingsState: CreateSettingsState<Settings> = (settings) => ({
  workMins: typeof settings.workMins === 'number' ? settings.workMins : 25,
  breakMins: typeof settings.breakMins === 'number' ? settings.breakMins : 5,
  longBreakMins: typeof settings.longBreakMins === 'number' ? settings.longBreakMins : 15,
  longBreakEvery: typeof settings.longBreakEvery === 'number' ? settings.longBreakEvery : 4,
  endSound: isEndSoundValue(settings.endSound) ? settings.endSound : glockenspielArpeggioId,
  endSoundVol: typeof settings.endSoundVol === 'number' ? settings.endSoundVol : 70,
})

function SettingsEditorComp({settings, settingsApi}: SettingsEditorReactComponentProps<Settings>) {
  const {updateSettings} = settingsApi;
  const endSound = useAudioFile(timerEndSoundFilesById[settings.endSound]?.path || '', settings.endSoundVol);
  const testSoundAction = useCallback(async () => { endSound.play(); }, [endSound]);

  return (
    <>
      <SettingBlock titleForId='pomodoro-work' title='Work'>
        <select id="pomodoro-work" value={settings.workMins} onChange={e => updateSettings({ ...settings, workMins: Number(e.target.value) || 25 })}>
          {workMinsOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </SettingBlock>

      <SettingBlock titleForId='pomodoro-break' title='Break'>
        <select id="pomodoro-break" value={settings.breakMins} onChange={e => updateSettings({ ...settings, breakMins: Number(e.target.value) || 5 })}>
          {breakMinsOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </SettingBlock>

      <SettingBlock titleForId='pomodoro-longBreakEvery' title='Long Break'>
        <SettingRow>
          <select id="pomodoro-longBreakEvery" aria-label='Long Break Frequency' value={settings.longBreakEvery} onChange={e => updateSettings({ ...settings, longBreakEvery: Number(e.target.value) || 0 })}>
            {longBreakEveryOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {settings.longBreakEvery > 0 && <select id="pomodoro-longBreakMins" aria-label='Long Break Duration' value={settings.longBreakMins} onChange={e => updateSettings({ ...settings, longBreakMins: Number(e.target.value) || 15 })}>
            {longBreakMinsOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>}
        </SettingRow>
      </SettingBlock>

      <SettingBlock titleForId='pomodoro-endSound' title='Phase-End Sound'>
        <SettingRow>
          <select id="pomodoro-endSound" value={settings.endSound} onChange={e => updateSettings({ ...settings, endSound: e.target.value })}>
            {endSoundOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <SettingActions actions={[{ id: 'TEST-SOUND', icon: playSvg, title: 'Test Sound', doAction: testSoundAction }]} />
        </SettingRow>
      </SettingBlock>

      <SettingBlock titleForId='pomodoro-endSoundVol' title='Sound Volume'>
        <select id="pomodoro-endSoundVol" value={settings.endSoundVol} onChange={e => updateSettings({ ...settings, endSoundVol: Number(e.target.value) || 70 })}>
          {volOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </SettingBlock>
    </>
  )
}

export const settingsEditorComp: ReactComponent<SettingsEditorReactComponentProps<Settings>> = {
  type: 'react',
  Comp: SettingsEditorComp
}
