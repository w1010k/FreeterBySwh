/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {WidgetType} from '@/widgets/appModules';
import {widgetSvg} from './icons';
import {createSettingsState, Settings, settingsEditorComp} from './settings';
import {widgetComp} from './widget';

const widgetType: WidgetType<Settings> = {
  id: 'calculator',
  icon: widgetSvg,
  name: 'Calculator',
  minSize: {
    w: 3,
    h: 5
  },
  description: 'The Calculator widget is a simple 4-function calculator with button and keyboard input.',
  createSettingsState,
  settingsEditorComp,
  widgetComp,
  requiresApi: ['clipboard']
}

export default widgetType;
