/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

/**
 * Widgets that an AI write newly showed without the confirm box ("always allow"). A Terminal among them does not
 * start its shell by itself the first time: the user starts it (Restart Shell). runAiRequest compares the shown
 * widgets before and after such a write, so any action that shows a widget is covered, now and later.
 */
const revealedByAi = new Set<string>();
/** Marks of widgets that never mount (most are not Terminals) are dropped oldest first. */
const MAX_MARKS = 200;
/** Each write running now, with the widgets shown before it: a view mounts during the write (the store renders at once). */
export type UnconfirmedAiWrite = { shownBefore: ReadonlySet<string>; taken: Set<string> };

const runningWrites = new Set<UnconfirmedAiWrite>();

export function markRevealedByAi(widgetIds: readonly string[]): void {
  for (const id of widgetIds) {
    revealedByAi.delete(id);
    revealedByAi.add(id);
  }
  for (const id of revealedByAi) {
    if (revealedByAi.size <= MAX_MARKS) {
      break;
    }
    revealedByAi.delete(id);
  }
}

export function beginUnconfirmedAiWrite(shownBefore: ReadonlySet<string>): UnconfirmedAiWrite {
  const write = { shownBefore, taken: new Set<string>() };
  runningWrites.add(write);
  return write;
}

export function endUnconfirmedAiWrite(write: UnconfirmedAiWrite, newlyShown: readonly string[]): void {
  runningWrites.delete(write);
  markRevealedByAi(newlyShown.filter(id => !write.taken.has(id)));
}

/**
 * True once for a widget an AI write showed (also while that write still runs); later views of it start as usual.
 * ponytail: a Terminal the user shows during the write (milliseconds) is taken as shown by it; it then waits for
 * Restart Shell (the safe side). Tell the two apart only if that shows up in use.
 */
export function takeRevealedByAi(widgetId: string): boolean {
  for (const write of runningWrites) {
    if (!write.shownBefore.has(widgetId) && !write.taken.has(widgetId)) {
      write.taken.add(widgetId);
      return true;
    }
  }
  return revealedByAi.delete(widgetId);
}

/** For tests. */
export function resetAiActivity(): void {
  revealedByAi.clear();
  runningWrites.clear();
}
