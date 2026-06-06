/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { RectPx } from '@/ui/types/dimensions';

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
    const el = ref.current;
    measure();
    // Re-measure on window resize…
    window.addEventListener('resize', measure);
    // …and whenever the element itself changes size without a window resize
    // (e.g. the workflow bar moving to a side / being drag-resized shrinks the
    // worktable). Guarded for environments (jsdom) that lack ResizeObserver.
    let resizeObserver: ResizeObserver | undefined;
    if (el && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(measure);
      resizeObserver.observe(el);
    }

    return () => {
      window.removeEventListener('resize', measure);
      resizeObserver?.disconnect();
    };
  }, [measure]);

  return [ref, rect, measure] as const;
}
