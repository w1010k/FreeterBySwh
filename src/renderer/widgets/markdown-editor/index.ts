/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { WidgetType } from '@/widgets/appModules';
import { settingsEditorComp, Settings, createSettingsState } from './settings';
import { widgetComp } from './widget';
import { widgetSvg } from './icons';

const widgetType: WidgetType<Settings> = {
  id: 'markdown-editor',
  icon: widgetSvg,
  name: 'Markdown Editor',
  minSize: {
    w: 6,
    h: 6
  },
  description: 'The Markdown Editor widget lists the Markdown files of a folder and edits them in tabs with a WYSIWYG editor. '
    + 'Edits are saved automatically, and changes made by other apps are loaded automatically.',
  createSettingsState,
  settingsEditorComp,
  widgetComp,
  requiresApi: ['fs', 'dataStorage']
}

export default widgetType;
