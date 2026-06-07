/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { WidgetType } from '@/widgets/appModules';
import { settingsEditorComp, Settings, createSettingsState } from './settings';
import { widgetComp } from './widget';
import { widgetSvg } from './icons';

const widgetType: WidgetType<Settings> = {
  id: 'clock',
  icon: widgetSvg,
  name: 'Clock',
  minSize: {
    w: 1,
    h: 1
  },
  description: 'The Clock widget shows the current time, with optional 12/24-hour, seconds and date — add multiple time zones for a world clock.',
  createSettingsState,
  settingsEditorComp,
  widgetComp,
}

export default widgetType;
