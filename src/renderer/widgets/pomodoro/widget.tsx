/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Button, ReactComponent, WidgetReactComponentProps } from '@/widgets/appModules';
import { Settings } from './settings';
import { useCallback, useEffect, useState } from 'react';
import styles from './widget.module.scss';
import clsx from 'clsx';
import { useAudioFile } from '@/widgets/timer/useAudioFile';
import { timerEndSoundFilesById } from '@/widgets/timer/audio/timer-end';

type Phase = 'work' | 'break';

function pad2(n: number) {
  return ('0' + n).slice(-2);
}
function msecsToMMSS(msecs: number) {
  const secs = Math.max(0, Math.floor(msecs / 1000));
  return `${pad2(Math.floor(secs / 60))}:${pad2(secs % 60)}`;
}

function WidgetComp({settings, widgetApi}: WidgetReactComponentProps<Settings>) {
  const { setDynamicTitle } = widgetApi;
  const { workMins, breakMins } = settings;

  const [phase, setPhase] = useState<Phase>('work');
  const [endMsecs, setEndMsecs] = useState(0);
  const [pausedLeft, setPausedLeft] = useState<number | null>(null);
  const [mmss, setMmss] = useState(msecsToMMSS(workMins * 60000));
  const [doneWork, setDoneWork] = useState(0); // completed work sessions

  const endSound = useAudioFile(timerEndSoundFilesById[settings.endSound]?.path || '', settings.endSoundVol);

  const phaseMsecs = useCallback((p: Phase) => (p === 'work' ? workMins : breakMins) * 60000, [workMins, breakMins]);

  const tick = useCallback(() => {
    const left = endMsecs - Date.now();
    if (left > 0) {
      setMmss(msecsToMMSS(left));
      return;
    }
    // Phase finished: chime, count a completed work session, and roll into the
    // next phase automatically.
    endSound.play();
    if (phase === 'work') {
      setDoneWork(n => n + 1);
    }
    const next: Phase = phase === 'work' ? 'break' : 'work';
    setPhase(next);
    setEndMsecs(Date.now() + phaseMsecs(next) + 500);
    setMmss(msecsToMMSS(phaseMsecs(next)));
  }, [endMsecs, endSound, phase, phaseMsecs])

  useEffect(() => {
    if (endMsecs > 0) {
      const interval = setInterval(tick, 1000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [endMsecs, tick])

  const isRunning = endMsecs > 0;
  const isPaused = !isRunning && pausedLeft !== null;
  const isActive = isRunning || isPaused;

  useEffect(() => {
    setDynamicTitle(isActive ? `${phase === 'work' ? 'Work' : 'Break'} ${mmss}` : null);
  }, [isActive, phase, mmss, setDynamicTitle])
  useEffect(() => () => setDynamicTitle(null), [setDynamicTitle])

  const start = useCallback(() => {
    setPhase('work');
    setEndMsecs(Date.now() + workMins * 60000 + 500);
    setPausedLeft(null);
    setMmss(msecsToMMSS(workMins * 60000));
  }, [workMins])

  const pause = useCallback(() => {
    const left = Math.max(0, endMsecs - Date.now());
    setPausedLeft(left);
    setMmss(msecsToMMSS(left));
    setEndMsecs(0);
  }, [endMsecs])

  const resume = useCallback(() => {
    if (pausedLeft !== null) {
      setEndMsecs(Date.now() + pausedLeft);
      setPausedLeft(null);
    }
  }, [pausedLeft])

  const reset = useCallback(() => {
    setEndMsecs(0);
    setPausedLeft(null);
    setPhase('work');
    setDoneWork(0);
    setMmss(msecsToMMSS(workMins * 60000));
  }, [workMins])

  if (!isActive) {
    return <div className={styles['pomodoro']}>
      <div className={styles['phase']}>Pomodoro</div>
      <div className={styles['mmss']}>{msecsToMMSS(workMins * 60000)}</div>
      {doneWork > 0 && <div className={styles['count']}>🍅 {doneWork}</div>}
      <div className={styles['buttons']}>
        <Button caption='Start' onClick={start} size='M'/>
        {doneWork > 0 && <Button caption='Reset' onClick={reset} size='M'/>}
      </div>
    </div>
  }
  return <div className={clsx(styles['pomodoro'], phase === 'work' ? styles['is-work'] : styles['is-break'])}>
    <div className={styles['phase']}>{phase === 'work' ? 'Work' : 'Break'}</div>
    <div className={styles['mmss']}>{mmss}</div>
    <div className={styles['count']}>🍅 {doneWork}</div>
    <div className={styles['buttons']}>
      {isRunning
        ? <Button caption='Pause' onClick={pause} size='M'/>
        : <Button caption='Resume' onClick={resume} size='M'/>}
      <Button caption='Reset' onClick={reset} size='M'/>
    </div>
  </div>
}

export const widgetComp: ReactComponent<WidgetReactComponentProps<Settings>> = {
  type: 'react',
  Comp: WidgetComp
}
