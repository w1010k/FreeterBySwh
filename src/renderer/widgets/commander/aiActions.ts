/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { WidgetAiAction } from '@/widgets/appModules';
import { createTriggerAiAction, nonEmptyStrings } from '@/widgets/aiTrigger';

export const commanderAiActions: WidgetAiAction[] = [createTriggerAiAction({
  name: 'runCommands',
  description: 'Run the widget\'s command lines in a terminal (same as clicking it).',
  apiKey: 'runCommands',
  // Every command is shown: the user is approving exactly what will run.
  describe: (widgetName, settings) => {
    const s = settings as { cmds?: unknown; cwd?: unknown } | undefined;
    const cwd = typeof s?.cwd === 'string' && s.cwd !== '' ? ` (in ${s.cwd})` : '';
    return `Run in a terminal from "${widgetName}": ${nonEmptyStrings(s?.cmds).join('; ')}${cwd}`;
  }
})] as WidgetAiAction[];
