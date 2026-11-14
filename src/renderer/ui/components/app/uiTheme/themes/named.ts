/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { UiThemeId, uiThemeDataById } from '@/base/uiTheme';
import { darkTheme } from '@/ui/components/app/uiTheme/themes/dark';
import { lightTheme } from '@/ui/components/app/uiTheme/themes/light';

type UiTheme = typeof darkTheme;

/**
 * The colors of a named theme. Text colors are 4.5:1 or more and the control edge 3:1 or more on the backgrounds
 * they are drawn on (tests/renderer/ui/components/app/uiTheme/contrast.spec.ts). Where a theme's own color fell short,
 * it was moved toward the text color just enough.
 */
interface ThemePalette {
  /** Top bar, tab bar, side panels, settings screens. */
  chrome: string;
  /** Worktable, open tabs, menus. */
  surface: string;
  widget: string;
  border: string;
  text: string;
  textSecondary: string;
  /** Fills, focus outline, primary button. */
  primary: string;
  /** Text on the primary button. */
  onPrimary: string;
  /** Links and accent text. */
  accentText: string;
  danger: string;
  input: string;
  /** The edge of a control: input, select, textarea (globals.scss draws the textarea with inputBorder). `border` draws
   * the separator lines (textareaBorder). */
  controlBorder: string;
  /** List item under the pointer. */
  hover: string;
  /** Selected list item. */
  selected: string;
}

// The light/dark kind comes from uiThemeDataById, so the colors and the kind the toggle and Terminal use cannot disagree.
function createTheme(id: UiThemeId, p: ThemePalette): UiTheme {
  const isDark = uiThemeDataById[id].kind === 'dark';
  const base = isDark ? darkTheme : lightTheme;
  const shadow = isDark ? '#00000070' : '#00000040';
  const dropArea = `${p.primary}40`;
  return {
    background: p.chrome,
    outline: p.primary,
    componentBackground: p.chrome,
    componentBorder: p.border,
    componentColor: p.text,
    dropAreaBackground: dropArea,
    primary: p.primary,
    textSecondary: p.textSecondary,
    accentText: p.accentText,
    popupShadow: shadow,
    dangerText: p.danger,

    primary90: `${p.primary}90`,
    primary80: `${p.primary}80`,
    primary70: `${p.primary}70`,
    primary60: `${p.primary}60`,
    primary50: `${p.primary}50`,
    primary40: `${p.primary}40`,
    primary30: `${p.primary}30`,
    primary20: `${p.primary}20`,
    primary10: `${p.primary}10`,

    componentColor90: `${p.text}90`,
    componentColor80: `${p.text}80`,
    componentColor70: `${p.text}70`,
    componentColor60: `${p.text}60`,
    componentColor50: `${p.text}50`,
    componentColor40: `${p.text}40`,
    componentColor30: `${p.text}30`,
    componentColor20: `${p.text}20`,
    componentColor10: `${p.text}10`,

    scrollbarThumb: base.scrollbarThumb,
    scrollbarThumbHover: base.scrollbarThumbHover,
    scrollbarThumbActive: base.scrollbarThumbActive,

    inputBackground: p.input,
    inputColor: p.text,
    inputBorder: p.controlBorder,

    selectBackground: p.input,
    selectColor: p.text,
    selectBorder: p.controlBorder,

    textareaBackground: p.input,
    textareaColor: p.text,
    textareaBorder: p.border,

    buttonBackground: 'transparent',
    buttonColor: p.text,
    buttonHoverBackground: `${p.text}20`,
    buttonActiveBackground: `${p.text}20`,
    buttonPressedBackground: `${p.primary}40`,
    buttonPressedBorder: p.primary,
    buttonPressedColor: p.text,

    buttonPrimaryBackground: p.primary,
    buttonPrimaryColor: p.onPrimary,
    buttonPrimaryHoverBackground: `${p.primary}D9`,
    buttonPrimaryActiveBackground: `${p.primary}D9`,

    inAppNoteColor: p.textSecondary,
    inAppNoteIconColor: p.text,
    inAppNoteNoProjectsBackground: p.chrome,
    inAppNoteNoWorkflowsBackground: p.chrome,

    topBarBackground: p.chrome,
    topBarBorder: p.border,

    paletteBackground: p.chrome,
    paletteBorder: `${p.primary}25`,
    paletteShadow: shadow,
    paletteNoteColor: p.text,
    paletteTabBackground: `${p.primary}25`,
    paletteTabColor: p.text,
    paletteTabHoverBackground: p.surface,
    paletteTabHoverColor: p.text,
    paletteSectionBackground: p.surface,
    paletteItemBackground: 'transparent',
    paletteItemColor: p.text,
    paletteItemHoverBackground: p.hover,
    paletteItemHoverColor: p.text,

    shelfDropAreaBackground: dropArea,
    shelfTabColor: p.text,
    shelfTabOpenBackground: p.surface,
    shelfTabOpenColor: p.text,
    shelfWidgetBoxBackground: p.surface,
    shelfWidgetBoxBorder: p.border,
    shelfWidgetBoxShadow: shadow,
    shelfWidgetBoxWidgetBorder: p.border,

    workflowSwitcherBackground: p.chrome,
    workflowSwitcherBorder: p.border,
    workflowSwitcherDropAreaBackground: dropArea,
    workflowSwitcherTabBackground: p.chrome,
    workflowSwitcherTabColor: p.text,
    workflowSwitcherTabHoverBackground: p.surface,
    workflowSwitcherTabHoverColor: p.text,
    workflowSwitcherTabOpenBackground: p.surface,
    workflowSwitcherTabOpenColor: p.text,

    worktableBackground: p.surface,
    widgetLayoutItemBorder: p.border,
    widgetLayoutItemEditHoverBorder: p.textSecondary,
    widgetLayoutItemResizingBorder: p.text,
    widgetLayoutItemResizingOpacity: '0.8',
    widgetLayoutGhostBackground: dropArea,
    widgetLayoutItemShadow: shadow,

    modalScreenBackground: p.chrome,
    modalScreenBorder: p.border,
    modalScreenColor: p.text,
    settingsScreenPanelColor: p.text,

    appManagerListBackground: p.chrome,
    appManagerListItemBackground: p.chrome,
    appManagerListItemColor: p.text,
    appManagerListItemHoverBackground: p.hover,
    appManagerListItemHoverColor: p.text,
    appManagerListItemSelectedBackground: p.selected,
    appManagerListItemSelectedColor: p.text,
    appManagerListItemDropAreaBackground: dropArea,

    projectManagerListBackground: p.chrome,
    projectManagerListItemBackground: p.chrome,
    projectManagerListItemColor: p.text,
    projectManagerListItemHoverBackground: p.hover,
    projectManagerListItemHoverColor: p.text,
    projectManagerListItemSelectedBackground: p.selected,
    projectManagerListItemSelectedColor: p.text,
    projectManagerListItemDropAreaBackground: dropArea,

    aboutScreenBorder: p.border,
    aboutScreenLeftBackground: p.chrome,
    aboutScreenLeftColor: p.text,
    aboutScreenRightBackground: p.surface,
    aboutScreenRightColor: p.text,
    aboutScreenRightLinkColor: p.accentText,
    aboutScreenLogoColor1: base.aboutScreenLogoColor1,
    aboutScreenLogoColor2: base.aboutScreenLogoColor2,
    aboutScreenLogoBorderColor: p.chrome,

    widgetBackground: p.widget,
    widgetColor: p.text,
    widgetHeaderBackground: p.widget,
    widgetHeaderBorder: p.border,
    widgetHeaderColor: p.text,
  };
}

// Palettes from the themes' published colors: Solarized (Ethan Schoonover), Catppuccin, One Dark (Atom), Nord,
// Tokyo Night, Dracula.
export const solarizedLightTheme = createTheme('solarized-light', {
  chrome: '#EEE8D5', surface: '#FDF6E3', widget: '#EEE8D5', border: '#E3DCC6',
  text: '#073642', textSecondary: '#52676E', primary: '#1B6CA8', onPrimary: '#FFFFFF', accentText: '#1B6CA8',
  danger: '#C0302C', input: '#FDF6E3', controlBorder: '#6E8086', hover: '#E6DFCA', selected: '#DDD6C1',
});

export const solarizedDarkTheme = createTheme('solarized-dark', {
  chrome: '#00252E', surface: '#002B36', widget: '#073642', border: '#0E4552',
  text: '#B4BFBF', textSecondary: '#93A1A1', primary: '#3D97D8', onPrimary: '#002B36', accentText: '#5AABE5',
  danger: '#F2807C', input: '#002B36', controlBorder: '#74898F', hover: '#0A3D4A', selected: '#124B59',
});

export const catppuccinLatteTheme = createTheme('catppuccin-latte', {
  chrome: '#E6E9EF', surface: '#EFF1F5', widget: '#E6E9EF', border: '#DCE0E8',
  text: '#4C4F69', textSecondary: '#5C5F77', primary: '#1E66F5', onPrimary: '#FFFFFF', accentText: '#1A56D6',
  danger: '#C50E36', input: '#FFFFFF', controlBorder: '#7C7F93', hover: '#DCE0E8', selected: '#CCD0DA',
});

export const catppuccinMochaTheme = createTheme('catppuccin-mocha', {
  chrome: '#181825', surface: '#11111B', widget: '#1E1E2E', border: '#313244',
  text: '#CDD6F4', textSecondary: '#A6ADC8', primary: '#89B4FA', onPrimary: '#1E1E2E', accentText: '#89B4FA',
  danger: '#F38BA8', input: '#313244', controlBorder: '#7F849C', hover: '#313244', selected: '#45475A',
});

export const oneDarkTheme = createTheme('one-dark', {
  chrome: '#21252B', surface: '#1E2127', widget: '#282C34', border: '#181A1F',
  text: '#ABB2BF', textSecondary: '#9097A3', primary: '#61AFEF', onPrimary: '#21252B', accentText: '#61AFEF',
  danger: '#E8848B', input: '#1D1F23', controlBorder: '#737A87', hover: '#2C313A', selected: '#3E4451',
});

export const nordTheme = createTheme('nord', {
  chrome: '#2E3440', surface: '#353B49', widget: '#3B4252', border: '#434C5E',
  text: '#ECEFF4', textSecondary: '#C0C8D6', primary: '#88C0D0', onPrimary: '#2E3440', accentText: '#88C0D0',
  danger: '#EBA0A7', input: '#2E3440', controlBorder: '#8390A8', hover: '#434C5E', selected: '#4C566A',
});

export const tokyoNightTheme = createTheme('tokyo-night', {
  chrome: '#16161E', surface: '#1A1B26', widget: '#1F2335', border: '#29293B',
  text: '#C0CAF5', textSecondary: '#9AA5CE', primary: '#7AA2F7', onPrimary: '#16161E', accentText: '#7AA2F7',
  danger: '#F7768E', input: '#24283B', controlBorder: '#737AA2', hover: '#292E42', selected: '#283457',
});

export const draculaTheme = createTheme('dracula', {
  chrome: '#191A21', surface: '#21222C', widget: '#282A36', border: '#343746',
  text: '#F8F8F2', textSecondary: '#B6B9CC', primary: '#BD93F9', onPrimary: '#21222C', accentText: '#BD93F9',
  danger: '#FF7A7A', input: '#343746', controlBorder: '#7380AE', hover: '#343746', selected: '#44475A',
});
