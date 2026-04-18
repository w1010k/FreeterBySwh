/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Fetch and track a dynamic icon for a widget keyed by some string (URL,
 * file path, …). Handles:
 *   - Initial fetch on mount + whenever `key` changes.
 *   - Flash-free reset so stale icons don't linger during key changes.
 *   - `retryIfMissing()` helper for use inside user-click handlers: skips
 *     if we already have an icon, otherwise force-refetches with cache
 *     bypass. A ref-guarded stale check prevents a late response from
 *     painting the old key's icon onto a new one if `key` changed during
 *     the in-flight refetch.
 *
 * `fetchFn` must be stable across renders for the effect to not thrash —
 * callers should source it from a memoized `widgetApi.icon.*` method.
 */
export function useDynamicIcon(
  fetchFn: (key: string, bypassCache?: boolean) => Promise<string | null>,
  key: string
): { icon: string | null; retryIfMissing: () => void } {
  const [icon, setIcon] = useState<string | null>(null);
  const keyRef = useRef(key);
  useEffect(() => { keyRef.current = key; }, [key]);

  useEffect(() => {
    let cancelled = false;
    setIcon(null);
    if (!key) {
      return undefined;
    }
    fetchFn(key).then(dataUri => {
      if (!cancelled) {
        setIcon(dataUri);
      }
    }).catch(() => {
      if (!cancelled) {
        setIcon(null);
      }
    });
    return () => { cancelled = true; };
  }, [key, fetchFn]);

  const retryIfMissing = useCallback(() => {
    if (!key || icon) {
      return;
    }
    const keyAtCall = key;
    fetchFn(keyAtCall, true).then(dataUri => {
      if (dataUri && keyAtCall === keyRef.current) {
        setIcon(dataUri);
      }
    }).catch(() => undefined);
  }, [key, icon, fetchFn]);

  return { icon, retryIfMissing };
}
