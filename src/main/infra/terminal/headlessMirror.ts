/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Terminal } from '@xterm/headless';
import { SerializeAddon } from '@xterm/addon-serialize';
import { TerminalMirror } from '@/application/terminal/terminalHost';

/**
 * A terminal with no screen that takes the shell's output, like Paseo's: a re-attached view gets the screen and the
 * scrollback as it is (a TUI's redraws included), and each chunk costs the parser's work only, not a copy of the
 * whole history. The parser works through writes later (in slices of a few ms), so a resize and a serialize wait for
 * the writes before them: write('', callback) runs once those are parsed.
 */
export function createHeadlessMirror(cols: number, rows: number, scrollback: number): TerminalMirror {
  const term = new Terminal({ cols, rows, scrollback, allowProposedApi: true });
  const serializer = new SerializeAddon();
  // The addon's types name the browser Terminal; the headless one has the same API.
  term.loadAddon(serializer as unknown as Parameters<Terminal['loadAddon']>[0]);
  let disposed = false;
  return {
    write: data => term.write(data),
    resize: (c, r) => term.write('', () => {
      if (!disposed) {
        term.resize(c, r);
      }
    }),
    // A terminal disposed meanwhile still calls back (tested): the view gets an empty screen, not a wait.
    serialize: () => new Promise(resolve => term.write('', () => resolve(disposed ? '' : serializer.serialize()))),
    onTitle: fn => {
      term.onTitleChange(fn);
    },
    dispose: () => {
      disposed = true;
      term.dispose();
    },
  };
}
