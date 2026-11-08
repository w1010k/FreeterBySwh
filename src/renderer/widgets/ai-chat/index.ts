/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { WidgetType } from '@/widgets/appModules';
import { settingsEditorComp, Settings, createSettingsState } from './settings';
import { forgetChatSession, widgetComp } from './widget';
import { widgetSvg } from './icons';

const widgetType: WidgetType<Settings> = {
  id: 'ai-chat',
  icon: widgetSvg,
  name: 'AI Chat',
  minSize: {
    w: 3,
    h: 3
  },
  description: 'The AI Chat widget talks with Claude Code or Codex installed on your computer. The AI can work in Freeter: add widgets, fill in notes and to-do lists, organize projects.',
  createSettingsState,
  settingsEditorComp,
  widgetComp,
  requiresApi: ['aiAgent', 'shell', 'dataStorage'],
  // They choose which CLI (and account) gets the user's messages.
  confirmSettings: ['tool', 'model', 'effort'],
  onDeleted: forgetChatSession
}

export default widgetType;
