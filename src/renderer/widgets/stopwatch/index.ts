/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {WidgetType} from '@/widgets/appModules';
import {widgetSvg} from './icons';
import {createSettingsState, Settings, settingsEditorComp} from './settings';
import {widgetComp} from './widget';

const widgetType: WidgetType<Settings> = {
  id: 'stopwatch',
  icon: widgetSvg,
  name: 'Stopwatch',
  minSize: {
    w: 3,
    h: 3
  },
  description: 'The Stopwatch widget counts elapsed time up from zero — start, pause/resume and reset, with 1/100s precision.',
  createSettingsState,
  settingsEditorComp,
  widgetComp,
  requiresApi: ['dataStorage']
}

export default widgetType;
