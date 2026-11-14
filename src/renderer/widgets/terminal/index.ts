/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { WidgetType } from '@/widgets/appModules';
import { settingsEditorComp, Settings, createSettingsState } from './settings';
import { forgetTerminalSession, widgetComp } from './widget';
import { widgetSvg } from './icons';

const widgetType: WidgetType<Settings> = {
  id: 'terminal',
  icon: widgetSvg,
  name: 'Terminal',
  minSize: {
    w: 4,
    h: 3
  },
  description: 'The Terminal widget runs a shell (PowerShell, cmd, bash...) inside Acedeck. Run Claude Code or Codex in it.',
  createSettingsState,
  settingsEditorComp,
  widgetComp,
  requiresApi: ['pty', 'shell'],
  requiresState: ['uiTheme'],
  runsPrograms: true,
  onDeleted: forgetTerminalSession
}

export default widgetType;
