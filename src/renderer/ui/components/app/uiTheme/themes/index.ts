import { UiThemeId } from '@/base/uiTheme';
import { darkTheme } from '@/ui/components/app/uiTheme/themes/dark';
import { lightTheme } from '@/ui/components/app/uiTheme/themes/light';
import {
  catppuccinLatteTheme, catppuccinMochaTheme, draculaTheme, nordTheme, oneDarkTheme, solarizedDarkTheme, solarizedLightTheme,
  tokyoNightTheme
} from '@/ui/components/app/uiTheme/themes/named';

type UiTheme = typeof darkTheme;

export const uiThemes: Record<UiThemeId, UiTheme> = {
  'dark': darkTheme,
  'light': lightTheme,
  'solarized-light': solarizedLightTheme,
  'solarized-dark': solarizedDarkTheme,
  'catppuccin-latte': catppuccinLatteTheme,
  'catppuccin-mocha': catppuccinMochaTheme,
  'one-dark': oneDarkTheme,
  'nord': nordTheme,
  'tokyo-night': tokyoNightTheme,
  'dracula': draculaTheme,
}
