/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { useEffect, useRef } from 'react';
import { WidgetAiAction, WidgetApi } from '@/widgets/appModules';

/**
 * An AI action that does what the widget's button does (open links, run commands):
 * it calls the function the mounted widget exposes under `apiKey`.
 */
export function createTriggerAiAction(o: {
  name: string;
  description: string;
  apiKey: string;
  describe: (widgetName: string, settings: unknown) => string;
}): WidgetAiAction<Record<string, never>> {
  return {
    name: o.name,
    description: o.description,
    kind: 'write',
    properties: {},
    parse: () => ({}),
    describe: (_input, widgetName, settings) => o.describe(widgetName, settings),
    run: ({ api }) => {
      const fn = api[o.apiKey];
      if (typeof fn !== 'function') {
        return { ok: false, code: 'not_ready', message: 'The widget is not ready' };
      }
      fn();
      return { ok: true, value: null };
    }
  };
}

/**
 * Exposes `{[key]: fn}` while the widget is mounted, calling the latest `fn`.
 * The exposed function closes over a ref only and is cleared on unmount, so the
 * app store never keeps the component alive (pitfalls: exposed API leaks).
 */
export function useExposedAiFunction<A extends unknown[], R>(exposeApi: WidgetApi['exposeApi'], key: string, fn: (...args: A) => R): void {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  }, [fn]);
  useEffect(() => {
    exposeApi({ [key]: (...args: A) => ref.current(...args) });
    return () => exposeApi({});
  }, [exposeApi, key]);
}

/** Every item: the user approves each one that opens (runAiRequest refuses a confirm text too long to show). */
export function listForConfirm(items: string[]): string {
  return items.join(', ');
}

export const nonEmptyStrings = (v: unknown): string[] =>
  (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s !== '') : []);
