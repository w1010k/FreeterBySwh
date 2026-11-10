/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { terminalThemes } from '@/widgets/terminal/theme';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const textColors = ['foreground', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'brightBlack',
  'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan'] as const;

describe('terminal themes', () => {
  it.each([
    ['dark', [...textColors, 'white', 'brightWhite']],
    ['light', [...textColors, 'black']], // white on light is a background color; minimumContrastRatio covers text on it
  ] as const)('%s: every color programs write text in has 4.5:1 or more on the background', (id, keys) => {
    const theme = terminalThemes[id];
    const failing = keys
      .map(key => ({ key, ratio: contrast(theme[key]!, theme.background!) }))
      .filter(p => p.ratio < 4.5)
      .map(p => `${p.key}: ${p.ratio.toFixed(2)}`);
    expect(failing).toEqual([]);
  });
});
