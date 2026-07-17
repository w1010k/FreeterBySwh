/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Button, ReactComponent, WidgetReactComponentProps } from '@/widgets/appModules';
import { Settings } from './settings';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './widget.module.scss';
import { useAudioFile } from '@/widgets/timer/useAudioFile';
import { timerEndSoundFilesById } from '@/widgets/timer/audio/timer-end';

function padTime(time: number) {
  return ('0' + time).slice(-2);
}

function msecsToMMSS(msecs: number) {
  const secs = Math.floor(msecs/1000);
  const m = Math.floor(secs/60);
  const s = Math.floor(secs-m*60);
  return `${padTime(m)}:${padTime(s)}`;
}

function WidgetComp({settings, widgetApi}: WidgetReactComponentProps<Settings>) {
  const { setDynamicTitle } = widgetApi;
  const [endMsecs, setEndMsecs] = useState(0);
  // Remaining ms captured on pause (null when not paused). Lets Resume continue
  // exactly where it left off.
  const [pausedLeft, setPausedLeft] = useState<number | null>(null);
  const [mmss, setMmss] = useState(msecsToMMSS(0));

  const msecs = settings.mins*60000

  const endSound = useAudioFile(timerEndSoundFilesById[settings.endSound]?.path || '', settings.endSoundVol);

  const endDesktop = settings.endDesktop;
  const tick = useCallback(() => {
    const msecsLeft = endMsecs - Date.now();
    setMmss(msecsToMMSS(msecsLeft));
    if(msecsLeft<=0) {
      setEndMsecs(0);
      setPausedLeft(null);
      endSound.play();
      if (endDesktop && typeof Notification !== 'undefined') {
        try {
          new Notification('Timer', { body: `Time is up! (${settings.mins} min)` });
        } catch {
          // Notifications unavailable (e.g. OS-level denial) — the sound already fired.
        }
      }
    }
  }, [endMsecs, endSound, endDesktop, settings.mins])

  useEffect(() => {
    if (endMsecs>0) {
      const interval = setInterval(tick, 1000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [endMsecs, tick])

  const isRunning = endMsecs > 0;
  const isPaused = !isRunning && pausedLeft !== null;
  const isActive = isRunning || isPaused;

  // Surface the remaining time in the widget header while active, so it's
  // visible even when the widget is tiny or in a background workflow.
  useEffect(() => {
    setDynamicTitle(isActive ? mmss : null);
  }, [isActive, mmss, setDynamicTitle])
  useEffect(() => () => setDynamicTitle(null), [setDynamicTitle])

  const totalMmss = useMemo(()=>msecsToMMSS(msecs), [msecs])
  const start = useCallback(() => {
    setEndMsecs(Date.now() + msecs + 500 /* A bit more to not have -2secs mmss on a first tick */ );
    setPausedLeft(null);
    setMmss(msecsToMMSS(msecs));
  }, [msecs])

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
  }, [])

  if (!isActive) {
    return <Button
      onClick={start}
      caption={totalMmss}
      title='Start'
      size='Fill'
      className={styles['timer-button']}
    />
  }
  return <div className={styles['timer-run-screen']}>
    <div className={styles['timer-run-screen-mmss']}>{mmss}</div>
    <div className={styles['timer-run-buttons']}>
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
