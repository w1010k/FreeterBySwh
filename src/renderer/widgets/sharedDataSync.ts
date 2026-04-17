/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { useEffect, useRef } from 'react';
import { SHARED_DATA_CHANGED_EVENT, SharedDataChangedEventDetail } from '@/base/sharedDataEvents';

/**
 * Subscribe to shared-data-changed broadcasts for a given widget type + scope.
 * Calls `reload` when a matching broadcast fires, unless `shouldSkip` returns
 * true (typically: user is currently editing this widget's input). Pass a
 * nullish `scope` to opt out of subscription (e.g. note widget without a key).
 *
 * `shouldSkip` and `reload` are read via refs so callers don't have to
 * memoize them — the subscription itself only re-runs when widgetType/scope
 * change.
 */
export function useSharedDataChangedEffect(
  widgetType: string,
  scope: string | null | undefined,
  shouldSkip: () => boolean,
  reload: () => void
) {
  const shouldSkipRef = useRef(shouldSkip);
  const reloadRef = useRef(reload);
  shouldSkipRef.current = shouldSkip;
  reloadRef.current = reload;

  useEffect(() => {
    if (!scope) {
      return undefined;
    }
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<SharedDataChangedEventDetail>).detail;
      if (!detail || detail.widgetType !== widgetType || detail.sharedKeyId !== scope) {
        return;
      }
      if (shouldSkipRef.current()) {
        return;
      }
      reloadRef.current();
    };
    window.addEventListener(SHARED_DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(SHARED_DATA_CHANGED_EVENT, handler);
  }, [widgetType, scope]);
}
