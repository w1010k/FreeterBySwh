/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {WidgetType} from '@/widgets/appModules';
import {widgetSvg} from './icons';
import {createSettingsState, Settings, settingsEditorComp} from './settings';
import {widgetComp} from './widget';

const widgetType: WidgetType<Settings> = {
  id: 'clock',
  icon: widgetSvg,
  name: 'Clock',
  minSize: {
    w: 3,
    h: 2
  },
  description: 'The Clock widget shows the current time, with optional 12/24-hour, seconds and date — add multiple time zones for a world clock.',
  createSettingsState,
  settingsEditorComp,
  widgetComp,
}

export default widgetType;
