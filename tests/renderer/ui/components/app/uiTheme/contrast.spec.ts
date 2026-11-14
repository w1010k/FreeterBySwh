/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { uiThemes } from '@/ui/components/app/uiTheme/themes';

// WCAG relative luminance and contrast ratio of two solid #RRGGBB colors.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  // Solid colors only: an alpha suffix (#RRGGBBAA) draws lighter than these digits say.
  expect([a, b]).toEqual([expect.stringMatching(/^#[0-9A-F]{6}$/i), expect.stringMatching(/^#[0-9A-F]{6}$/i)]);
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// The text and control colors the themes promise, on the backgrounds they are drawn on.
const pairs: Array<[keyof typeof uiThemes.light, Array<keyof typeof uiThemes.light>, number]> = [
  ['textSecondary', ['componentBackground', 'widgetBackground', 'textareaBackground', 'modalScreenBackground'], 4.5],
  ['accentText', ['componentBackground', 'widgetBackground', 'textareaBackground'], 4.5],
  ['dangerText', ['componentBackground', 'widgetBackground', 'textareaBackground'], 4.5],
  ['inAppNoteColor', ['componentBackground'], 4.5],
  ['inputBorder', ['inputBackground', 'componentBackground', 'widgetBackground', 'modalScreenBackground'], 3],
  ['aboutScreenRightLinkColor', ['aboutScreenRightBackground'], 4.5],
  ['componentColor', ['componentBackground', 'widgetBackground', 'inputBackground', 'worktableBackground'], 4.5],
  ['buttonPrimaryColor', ['buttonPrimaryBackground'], 4.5],
];

describe('UI theme contrast', () => {
  it.each(Object.keys(uiThemes) as Array<keyof typeof uiThemes>)('%s theme keeps text at 4.5:1 and control edges at 3:1', (id) => {
    const theme = uiThemes[id] as Record<string, string>;
    const failing = pairs.flatMap(([fg, bgs, min]) => bgs
      .map(bg => ({ fg, bg, ratio: contrast(theme[fg], theme[bg]) }))
      .filter(p => p.ratio < min)
      .map(p => `${p.fg} on ${p.bg}: ${p.ratio.toFixed(2)} < ${min}`));
    expect(failing).toEqual([]);
  });
});
