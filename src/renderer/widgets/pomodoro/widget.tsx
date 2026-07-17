/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Button, ReactComponent, WidgetReactComponentProps } from '@/widgets/appModules';
import { Settings } from './settings';
import { useCallback, useEffect, useRef, useState } from 'react';
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

// dataStorage key holding the running/paused state and the session count, so
// an active pomodoro survives widget remounts and app restarts.
const stateKey = 'state';

function WidgetComp({settings, widgetApi}: WidgetReactComponentProps<Settings>) {
  const { setDynamicTitle, dataStorage } = widgetApi;
  const { workMins, breakMins, longBreakMins, longBreakEvery } = settings;

  const [phase, setPhase] = useState<Phase>('work');
  const [endMsecs, setEndMsecs] = useState(0);
  const [pausedLeft, setPausedLeft] = useState<number | null>(null);
  const [mmss, setMmss] = useState(msecsToMMSS(workMins * 60000));
  const [doneWork, setDoneWork] = useState(0); // completed work sessions

  // Restore once on mount; a user click before the async read resolves wins.
  // ponytail: a phase that expired while the app was closed restores as idle
  // (keeping the session count) instead of replaying missed phase rolls.
  const [restored, setRestored] = useState(false);
  const userActedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const v = await dataStorage.getJson(stateKey) as
        { phase?: unknown; endMsecs?: unknown; pausedLeft?: unknown; doneWork?: unknown } | undefined;
      if (!cancelled && !userActedRef.current && v && typeof v === 'object') {
        const p: Phase = v.phase === 'break' ? 'break' : 'work';
        if (typeof v.doneWork === 'number' && v.doneWork > 0) {
          setDoneWork(v.doneWork);
        }
        if (typeof v.endMsecs === 'number' && v.endMsecs > Date.now()) {
          setPhase(p);
          setEndMsecs(v.endMsecs);
          setMmss(msecsToMMSS(v.endMsecs - Date.now()));
        } else if (typeof v.pausedLeft === 'number' && v.pausedLeft > 0) {
          setPhase(p);
          setPausedLeft(v.pausedLeft);
          setMmss(msecsToMMSS(v.pausedLeft));
        }
      }
      if (!cancelled) {
        setRestored(true);
      }
    })().catch(() => setRestored(true));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (restored) {
      dataStorage.setJson(stateKey, { phase, endMsecs, pausedLeft, doneWork });
    }
  }, [restored, phase, endMsecs, pausedLeft, doneWork, dataStorage]);

  const endSound = useAudioFile(timerEndSoundFilesById[settings.endSound]?.path || '', settings.endSoundVol);

  // A break is "long" when it follows every Nth completed work session.
  // Derived from doneWork (not stored) so pause/restore can't desync it.
  const isLongBreak = (done: number) => longBreakEvery > 0 && done > 0 && done % longBreakEvery === 0;

  const tick = useCallback(() => {
    const left = endMsecs - Date.now();
    if (left > 0) {
      setMmss(msecsToMMSS(left));
      return;
    }
    // Phase finished: chime, count a completed work session, and roll into the
    // next phase automatically (a long break after every Nth work session).
    endSound.play();
    let nextMins: number;
    let next: Phase;
    if (phase === 'work') {
      const newDone = doneWork + 1;
      setDoneWork(newDone);
      next = 'break';
      nextMins = isLongBreak(newDone) ? longBreakMins : breakMins;
    } else {
      next = 'work';
      nextMins = workMins;
    }
    setPhase(next);
    setEndMsecs(Date.now() + nextMins * 60000 + 500);
    setMmss(msecsToMMSS(nextMins * 60000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endMsecs, endSound, phase, doneWork, workMins, breakMins, longBreakMins, longBreakEvery])

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

  const phaseLabel = phase === 'work' ? 'Work' : (isLongBreak(doneWork) ? 'Long Break' : 'Break');
  useEffect(() => {
    setDynamicTitle(isActive ? `${phaseLabel} ${mmss}` : null);
  }, [isActive, phaseLabel, mmss, setDynamicTitle])
  useEffect(() => () => setDynamicTitle(null), [setDynamicTitle])

  const start = useCallback(() => {
    userActedRef.current = true;
    setPhase('work');
    setEndMsecs(Date.now() + workMins * 60000 + 500);
    setPausedLeft(null);
    setMmss(msecsToMMSS(workMins * 60000));
  }, [workMins])

  const pause = useCallback(() => {
    userActedRef.current = true;
    const left = Math.max(0, endMsecs - Date.now());
    setPausedLeft(left);
    setMmss(msecsToMMSS(left));
    setEndMsecs(0);
  }, [endMsecs])

  const resume = useCallback(() => {
    userActedRef.current = true;
    if (pausedLeft !== null) {
      setEndMsecs(Date.now() + pausedLeft);
      setPausedLeft(null);
    }
  }, [pausedLeft])

  const reset = useCallback(() => {
    userActedRef.current = true;
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
    <div className={styles['phase']}>{phaseLabel}</div>
    <div className={styles['mmss']}>{mmss}</div>
    {doneWork > 0 && <div className={styles['count']}>🍅 {doneWork}</div>}
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
