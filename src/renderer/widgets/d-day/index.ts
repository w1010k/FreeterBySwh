/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { WidgetType } from '@/widgets/appModules';
import { settingsEditorComp, Settings, createSettingsState } from './settings';
import { widgetComp } from './widget';
import { widgetSvg } from './icons';

const widgetType: WidgetType<Settings> = {
  id: 'd-day',
  icon: widgetSvg,
  name: 'D-Day',
  minSize: {
    w: 1,
    h: 1
  },
  description: 'The D-Day widget counts the days until (or since) one or more target dates — D-30, D-DAY, D+15.',
  createSettingsState,
  settingsEditorComp,
  widgetComp,
}

export default widgetType;
