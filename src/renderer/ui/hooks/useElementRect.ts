/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {RectPx} from '@/ui/types/dimensions';
import {useCallback, useLayoutEffect, useRef, useState} from 'react';

const getElRect = (el: HTMLElement | null, useViewportRect: boolean) => {
  if (el) {
    if (useViewportRect) {
      const rect = el.getBoundingClientRect();
      return {
        xPx: rect.left,
        yPx: rect.top,
        wPx: rect.width,
        hPx: rect.height
      };
    } else {
      return {
        xPx: el.clientLeft,
        yPx: el.clientTop,
        wPx: el.clientWidth,
        hPx: el.clientHeight
      };
    }
  } else {
    return {
      xPx: 0,
      yPx: 0,
      wPx: 0,
      hPx: 0
    }
  }
}

export function useElementRect(opts?: {
  useViewportRect?: boolean;
  defaultVal?: RectPx;
}) {
  const useViewportRect = !!opts?.useViewportRect;
  const ref = useRef<HTMLElement>(null);
  const [rect, setRect] = useState<RectPx>(opts?.defaultVal || getElRect(null, useViewportRect))

  // Re-measure the current element. Returned to callers so they can refresh the
  // rect on demand — e.g. just before showing a popup positioned from it, since
  // a ResizeObserver only fires on size changes and misses pure position shifts
  // (a sibling being deleted/added moves this element without resizing it).
  const measure = useCallback(() => {
    if (ref.current) {
      setRect(getElRect(ref.current, useViewportRect));
    }
  }, [useViewportRect]);

  useLayoutEffect(() => {
    measure();
    // Re-measure on window resize.
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  // Also re-measure whenever the element itself changes size without a window
  // resize (e.g. the workflow bar moving to a side / being drag-resized shrinks
  // the worktable). Runs after every commit because React may swap the ref'd
  // element without the deps changing: WidgetLayout renders a placeholder <div>
  // first and a different <div> once mounted, and an observer bound once at mount
  // would stay stuck on the detached placeholder. The identity check keeps
  // ordinary re-renders free. Observing a new element fires an initial callback,
  // so no explicit measure() is needed here. Guarded for jsdom (no ResizeObserver).
  const observedElRef = useRef<HTMLElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === observedElRef.current) {
      return;
    }
    observedElRef.current = el;
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    if (el && typeof ResizeObserver !== 'undefined') {
      resizeObserverRef.current = new ResizeObserver(measure);
      resizeObserverRef.current.observe(el);
    }
  });
  // Disconnect on unmount. Resetting the observed element lets a StrictMode
  // remount re-attach instead of being skipped by the identity check above.
  useLayoutEffect(() => () => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    observedElRef.current = null;
  }, []);

  return [ref, rect, measure] as const;
}
