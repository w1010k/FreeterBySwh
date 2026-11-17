/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import type { IBuffer } from '@xterm/xterm';
import { bufferText, decodeInput, inputPresets } from '@/widgets/terminal/actions';

describe('decodeInput()', () => {
  it('turns the Windows Terminal escapes into the keys they stand for', () => {
    expect(decodeInput('git status\\r')).toBe('git status\r');
    expect(decodeInput('a\\nb\\tc')).toBe('a\nb\tc');
    expect(decodeInput('\\e')).toBe('\x1b');
    expect(decodeInput('\\x03')).toBe('\x03');
    expect(decodeInput('\\x1B[A')).toBe('\x1b[A');
  });

  it('types a backslash for \\\\, and leaves other backslashes as typed', () => {
    expect(decodeInput('cd C:\\\\temp')).toBe('cd C:\\temp');
    expect(decodeInput('cd C:\\Users')).toBe('cd C:\\Users');
    // A path with \t, \n, \r or \e in it needs \\ (the help text says so): here \t is a Tab.
    expect(decodeInput('cd C:\\temp')).toBe('cd C:\temp');
    expect(decodeInput('\\q \\x4')).toBe('\\q \\x4');
    // Past ASCII the shell would get two UTF-8 bytes, not the one byte asked for: left as typed.
    expect(decodeInput('\\x9B\\xFF')).toBe('\\x9B\\xFF');
    expect(decodeInput('\\x7F')).toBe('\x7f');
    // \\r is a backslash and then the letter r, not Enter.
    expect(decodeInput('\\\\r')).toBe('\\r');
  });

  it('gives each preset an input that types something', () => {
    for (const preset of inputPresets) {
      expect(decodeInput(preset.input)).not.toBe('');
    }
    expect(decodeInput(inputPresets.find(p => p.name === 'Send Ctrl+C')!.input)).toBe('\x03');
  });
});

describe('bufferText()', () => {
  const buffer = (lines: { text: string; wrapped?: boolean }[]) => ({
    length: lines.length,
    getLine: (i: number) => lines[i] && {
      isWrapped: !!lines[i].wrapped,
      translateToString: (trimRight?: boolean) => (trimRight ? lines[i].text.trimEnd() : lines[i].text)
    }
  }) as unknown as IBuffer;

  it('joins the lines, drops trailing spaces and the empty lines at the end', () => {
    expect(bufferText(buffer([{ text: 'PS C:\\> ls   ' }, { text: 'a.txt' }, { text: '' }, { text: '   ' }]))).toBe('PS C:\\> ls\na.txt');
  });

  it('joins a line the terminal wrapped to the line before it, keeping the space at the wrap', () => {
    expect(bufferText(buffer([{ text: 'hello ' }, { text: 'world', wrapped: true }, { text: 'next' }]))).toBe('hello world\nnext');
  });
});
