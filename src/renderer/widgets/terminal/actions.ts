/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import type { IBuffer } from '@xterm/xterm';
import { BuiltinActionInfo } from '@/widgets/customActions';

export const labelRunStartCommand = 'Run Start Command';
export const labelCopyOutput = 'Copy Output';
export const labelReadOnly = 'Read-Only (block typing)';
export const labelOpenStartFolder = 'Open Start Folder';
export const labelRestartShell = 'Restart Shell';

// The buttons the Actions setting lists, in the action bar's default order. Custom actions go
// between the two lists. Keep the ids in step with the action bar (a test checks it).
export const builtinActionsBeforeCustom: readonly BuiltinActionInfo[] = [
  { id: 'RUN-START', label: labelRunStartCommand, note: 'shown when Start Command is set' },
];
export const builtinActionsAfterCustom: readonly BuiltinActionInfo[] = [
  { id: 'COPY-OUTPUT', label: labelCopyOutput },
  { id: 'READ-ONLY', label: labelReadOnly },
  { id: 'OPEN-FOLDER', label: labelOpenStartFolder },
  { id: 'RESTART', label: labelRestartShell },
];

// Ready-made custom actions. Picking one copies its name and input into a new row. The input
// goes to whatever runs in the shown tab: the Claude Code ones are for a running Claude Code.
export const inputPresets: readonly { name: string; input: string }[] = [
  { name: 'Send Ctrl+C', input: '\\x03' },
  { name: 'Send Esc', input: '\\e' },
  { name: 'Claude Code: /clear', input: '/clear\\r' },
  { name: 'Claude Code: /compact', input: '/compact\\r' },
  { name: 'Continue Claude Code', input: 'claude --continue\\r' },
  { name: 'Git Status', input: 'git status\\r' },
];

// The text a custom action types, with the escapes Windows Terminal's sendInput users know:
// \r (Enter), \n, \t, \e (Esc), \xHH for an ASCII key code 00 to 7F (e.g. \x03 for Ctrl+C) and \\ (a backslash).
// Anything else after a backslash stays as typed: \x80 and up too, as the shell gets text in UTF-8 and such a
// code would not reach it as one byte.
export function decodeInput(text: string): string {
  return text.replace(/\\(x[0-7][0-9a-fA-F]|[rnte\\])/g, (_m, esc: string) => {
    switch (esc) {
      case 'r': return '\r';
      case 'n': return '\n';
      case 't': return '\t';
      case 'e': return '\x1b';
      case '\\': return '\\';
      default: return String.fromCharCode(parseInt(esc.slice(1), 16));
    }
  });
}

// The screen and scrollback as plain text: a line the terminal wrapped joins the line before
// it, and the empty lines at the end go.
export function bufferText(buffer: IBuffer): string {
  const lines: string[] = [];
  for (let i = 0; i < buffer.length; i++) {
    const line = buffer.getLine(i);
    if (!line) {
      continue;
    }
    // A line that goes on in the next row keeps its trailing spaces (the space at the wrap is text).
    const text = line.translateToString(!buffer.getLine(i + 1)?.isWrapped);
    if (line.isWrapped && lines.length > 0) {
      lines[lines.length - 1] += text;
    } else {
      lines.push(text);
    }
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.join('\n');
}
