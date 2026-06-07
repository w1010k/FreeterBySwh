/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { WidgetType } from '@/widgets/appModules';
import { settingsEditorComp, Settings, createSettingsState } from './settings';
import { widgetComp } from './widget';
import { widgetSvg } from './icons';

const widgetType: WidgetType<Settings> = {
  id: 'stopwatch',
  icon: widgetSvg,
  name: 'Stopwatch',
  minSize: {
    w: 1,
    h: 1
  },
  description: 'The Stopwatch widget counts elapsed time up from zero — start, pause/resume and reset, with 1/100s precision.',
  createSettingsState,
  settingsEditorComp,
  widgetComp,
}

export default widgetType;
