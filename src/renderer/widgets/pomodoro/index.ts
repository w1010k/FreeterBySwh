/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { WidgetType } from '@/widgets/appModules';
import { settingsEditorComp, Settings, createSettingsState } from './settings';
import { widgetComp } from './widget';
import { widgetSvg } from './icons';

const widgetType: WidgetType<Settings> = {
  id: 'pomodoro',
  icon: widgetSvg,
  name: 'Pomodoro',
  minSize: {
    w: 1,
    h: 1
  },
  description: 'The Pomodoro widget runs alternating work/break countdowns with a sound at each switch — start, pause/resume and reset.',
  createSettingsState,
  settingsEditorComp,
  widgetComp,
}

export default widgetType;
