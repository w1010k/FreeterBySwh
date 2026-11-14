/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import type { ITheme } from '@xterm/xterm';
import type { UiThemeKind } from '@/base/uiTheme';

/**
 * The terminal's light and dark colors. The Theme setting picks one (Dark by default), or, with Follow App, the one of
 * the app theme's kind (Nord: dark). The ANSI colors keep their usual meaning (white is light,
 * black is dark); readable text on any of them comes from xterm's `minimumContrastRatio` (widget.tsx), which moves a
 * cell's text color away from its actual background. The palettes still start every text color at 4.5:1 or more on the
 * default background where they can (tests/renderer/widgets/terminal/theme.spec.ts).
 */
export const terminalThemes: Record<UiThemeKind, ITheme> = {
  dark: {
    background: '#1F1F1F',
    foreground: '#CCCCCC',
    cursor: '#CCCCCC',
    cursorAccent: '#1F1F1F',
    selectionBackground: '#264F78',
    black: '#000000',
    red: '#F14C4C',
    green: '#23D18B',
    yellow: '#E5E510',
    blue: '#3B8EEA',
    magenta: '#D670D6',
    cyan: '#29B8DB',
    white: '#E5E5E5',
    brightBlack: '#8C8C8C',
    brightRed: '#F14C4C',
    brightGreen: '#23D18B',
    brightYellow: '#F5F543',
    brightBlue: '#61A8F5',
    brightMagenta: '#D670D6',
    brightCyan: '#29B8DB',
    brightWhite: '#FFFFFF',
  },
  light: {
    background: '#FFFFFF',
    foreground: '#3B3B3B',
    cursor: '#3B3B3B',
    cursorAccent: '#FFFFFF',
    selectionBackground: '#ADD6FF',
    black: '#000000',
    red: '#CD3131',
    green: '#107C10',
    yellow: '#8A6D00',
    blue: '#0451A5',
    magenta: '#BC05BC',
    cyan: '#0E7490',
    white: '#E5E5E5',
    brightBlack: '#666666',
    brightRed: '#CD3131',
    brightGreen: '#0B7B0B',
    brightYellow: '#7A5F00',
    brightBlue: '#0451A5',
    brightMagenta: '#A100A1',
    brightCyan: '#0E6D86',
    brightWhite: '#FFFFFF',
  },
};
