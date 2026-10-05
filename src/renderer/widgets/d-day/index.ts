/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {WidgetType} from '@/widgets/appModules';
import {widgetSvg} from './icons';
import {createSettingsState, Settings, settingsEditorComp} from './settings';
import {widgetComp} from './widget';

const widgetType: WidgetType<Settings> = {
  id: 'd-day',
  icon: widgetSvg,
  name: 'D-Day',
  minSize: {
    w: 3,
    h: 2
  },
  description: 'The D-Day widget counts the days until (or since) one or more target dates — D-30, D-DAY, D+15.',
  createSettingsState,
  settingsEditorComp,
  widgetComp,
}

export default widgetType;
