/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

export type DebouncedFunc<TArgs extends unknown[] = unknown[]> = (
  (...args: TArgs) => void
) & {
  cancel: () => void;
  /** Run the pending call immediately (if any) and clear the timer. No-op when nothing is pending. */
  flush: () => void;
}

export function debounce<TArgs extends unknown[] = unknown[]>(
  func: (...args: TArgs) => void,
  msec: number
) {
  let timer: ReturnType<typeof setTimeout>;
  let pendingArgs: TArgs | undefined;
  const debouncedFunc: DebouncedFunc<TArgs> = (...args) => {
    pendingArgs = args;
    clearTimeout(timer);
    timer = setTimeout(() => {
      pendingArgs = undefined;
      func(...args);
    }, msec);
  };

  debouncedFunc.cancel = () => {
    clearTimeout(timer);
    pendingArgs = undefined;
  };

  debouncedFunc.flush = () => {
    if (pendingArgs !== undefined) {
      clearTimeout(timer);
      const args = pendingArgs;
      pendingArgs = undefined;
      func(...args);
    }
  };

  return debouncedFunc;
}
