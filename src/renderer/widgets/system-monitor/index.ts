/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { WidgetType } from '@/widgets/appModules';
import { settingsEditorComp, Settings, createSettingsState } from './settings';
import { widgetComp } from './widget';
import { widgetSvg } from './icons';

const widgetType: WidgetType<Settings> = {
  id: 'system-monitor',
  icon: widgetSvg,
  name: 'System Monitor',
  minSize: {
    w: 1,
    h: 1
  },
  description: 'The System Monitor widget shows live CPU and RAM usage of your computer.',
  createSettingsState,
  settingsEditorComp,
  widgetComp,
  requiresApi: ['systemStats']
}

export default widgetType;
