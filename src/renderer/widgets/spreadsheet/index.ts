/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {WidgetType} from '@/widgets/appModules';
import {widgetSvg} from './icons';
import {createSettingsState, Settings, settingsEditorComp} from './settings';
import {widgetComp} from './widget';

const widgetType: WidgetType<Settings> = {
  id: 'spreadsheet',
  icon: widgetSvg,
  name: 'Spreadsheet',
  minSize: {
    w: 4,
    h: 3
  },
  description: 'The Spreadsheet widget gives you a small grid for numbers and notes, with formulas (=SUM(A1:A10), =IF(...)), and copy/paste that works with Excel and Google Sheets.',
  createSettingsState,
  settingsEditorComp,
  widgetComp,
  requiresApi: ['dataStorage']
}

export default widgetType;
