/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createHeadlessMirror } from '@/infra/terminal/headlessMirror';

describe('createHeadlessMirror', () => {
  it('serializes what was written just before (the parser works through writes later)', async () => {
    const m = createHeadlessMirror(20, 4, 100);
    m.write('hello');
    await expect(m.serialize()).resolves.toContain('hello');
    m.dispose();
  });

  it('turns the output into the screen it draws (a redraw replaces the old text), and follows resizes', async () => {
    const m = createHeadlessMirror(20, 4, 100);
    m.write('hello\r\nworld');
    m.write('\r\x1b[2Kthere'); // the TUI redraws the line
    const screen = await m.serialize();
    expect(screen).toContain('hello');
    expect(screen).toContain('there');
    expect(screen).not.toContain('world');
    m.resize(30, 5);
    await expect(m.serialize()).resolves.toContain('hello');
    m.dispose();
  });

  it('answers a serialize that waits when the terminal ends (a view waiting for it is not left waiting)', async () => {
    const m = createHeadlessMirror(20, 4, 100);
    m.write('x'.repeat(100000));
    const screen = m.serialize();
    m.dispose();
    await expect(screen).resolves.toBe('');
  });

  it('reports the title the output sets (OSC 0)', async () => {
    const m = createHeadlessMirror(20, 4, 10);
    const titles: string[] = [];
    m.onTitle(t => titles.push(t));
    m.write('\x1b]0;Claude Code\x07');
    await m.serialize();
    expect(titles).toEqual(['Claude Code']);
    m.dispose();
  });

  it('applies a resize after the output written before it (that output was made for the old size)', async () => {
    const m = createHeadlessMirror(10, 3, 10);
    m.write('\x1b[1;15HX'); // column 15 at width 10: the last column
    m.resize(20, 3);
    await expect(m.serialize()).resolves.toBe('\x1b[9CX');
    m.dispose();
  });
});
