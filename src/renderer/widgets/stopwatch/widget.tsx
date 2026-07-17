/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Button, ReactComponent, WidgetReactComponentProps } from '@/widgets/appModules';
import { Settings } from './settings';
import { formatStopwatch } from './stopwatch';
import styles from './widget.module.scss';
import { useCallback, useEffect, useRef, useState } from 'react';

// While running, refresh ~33x/s so the centiseconds tick smoothly. The shown
// value is always derived from Date.now() (see computeElapsed), so a throttled
// or missed tick never makes the clock drift — it just updates less often.
const tickMsec = 30;

// dataStorage key holding the running/paused state, so a running stopwatch
// survives widget remounts and app restarts (startTs is an absolute timestamp,
// so time keeps counting while the app is closed — real stopwatch semantics).
const stateKey = 'state';

function WidgetComp({widgetApi}: WidgetReactComponentProps<Settings>) {
  const { dataStorage } = widgetApi;
  const [running, setRunning] = useState(false);
  // Elapsed time carried over from previous run segments (ms), plus the start
  // timestamp of the current segment when running.
  const accumulatedRef = useRef(0);
  const startTsRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const computeElapsed = useCallback(
    () => accumulatedRef.current + (startTsRef.current !== null ? Date.now() - startTsRef.current : 0),
    []
  );

  const persist = useCallback(() => {
    dataStorage.setJson(stateKey, { accumulated: accumulatedRef.current, startTs: startTsRef.current });
  }, [dataStorage]);

  // Restore once on mount; a user click before the async read resolves wins.
  const userActedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const v = await dataStorage.getJson(stateKey) as { accumulated?: unknown; startTs?: unknown } | undefined;
      if (cancelled || userActedRef.current || !v || typeof v !== 'object') {
        return;
      }
      accumulatedRef.current = typeof v.accumulated === 'number' ? v.accumulated : 0;
      startTsRef.current = typeof v.startTs === 'number' ? v.startTs : null;
      setElapsedMs(computeElapsed());
      setRunning(startTsRef.current !== null);
    })().catch(() => undefined);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!running) {
      return undefined;
    }
    const id = setInterval(() => setElapsedMs(computeElapsed()), tickMsec);
    return () => clearInterval(id);
  }, [running, computeElapsed]);

  const start = useCallback(() => {
    userActedRef.current = true;
    startTsRef.current = Date.now();
    setRunning(true);
    persist();
  }, [persist]);

  const pause = useCallback(() => {
    userActedRef.current = true;
    accumulatedRef.current = computeElapsed();
    startTsRef.current = null;
    setRunning(false);
    setElapsedMs(accumulatedRef.current);
    persist();
  }, [computeElapsed, persist]);

  const reset = useCallback(() => {
    userActedRef.current = true;
    accumulatedRef.current = 0;
    startTsRef.current = null;
    setRunning(false);
    setElapsedMs(0);
    persist();
  }, [persist]);

  const hasElapsed = elapsedMs > 0;

  return (
    <div className={styles['stopwatch']}>
      <div className={styles['time']}>{formatStopwatch(elapsedMs)}</div>
      <div className={styles['buttons']}>
        {running
          ? <Button caption='Pause' onClick={pause} size='M' />
          : <Button caption={hasElapsed ? 'Resume' : 'Start'} onClick={start} size='M' />}
        {hasElapsed && <Button caption='Reset' onClick={reset} size='M' />}
      </div>
    </div>
  );
}

export const widgetComp: ReactComponent<WidgetReactComponentProps<Settings>> = {
  type: 'react',
  Comp: WidgetComp
}
