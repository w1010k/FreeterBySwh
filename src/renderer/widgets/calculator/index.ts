/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { WidgetType } from '@/widgets/appModules';
import { settingsEditorComp, Settings, createSettingsState } from './settings';
import { widgetComp } from './widget';
import { widgetSvg } from './icons';

const widgetType: WidgetType<Settings> = {
  id: 'calculator',
  icon: widgetSvg,
  name: 'Calculator',
  minSize: {
    w: 1,
    h: 1
  },
  description: 'The Calculator widget is a simple 4-function calculator with button and keyboard input.',
  createSettingsState,
  settingsEditorComp,
  widgetComp,
  requiresApi: ['clipboard']
}

export default widgetType;
