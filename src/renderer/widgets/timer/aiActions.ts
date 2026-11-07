/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { WidgetAiAction } from '@/widgets/appModules';

export const timerCommands = ['start', 'pause', 'resume', 'reset'] as const;
export type TimerCommand = typeof timerCommands[number];

const control: WidgetAiAction<{ command: TimerCommand }> = {
  name: 'control',
  description: 'Press a timer button: start (from the configured duration), pause, resume, or reset.',
  kind: 'write',
  properties: { command: { enum: [...timerCommands] } },
  required: ['command'],
  parse: (input) => (timerCommands.some(c => c === input.command) ? { command: input.command as TimerCommand } : undefined),
  describe: ({ command }, widgetName) => `${command[0].toUpperCase()}${command.slice(1)} timer "${widgetName}"`,
  run: ({ api }, { command }) => {
    if (typeof api.control !== 'function') {
      return { ok: false, code: 'not_ready', message: 'The timer is not ready' };
    }
    return api.control(command)
      ? { ok: true, value: null }
      : { ok: false, code: 'failed', message: `"${command}" does not apply to the timer now` };
  }
};

export const timerAiActions: WidgetAiAction[] = [control] as WidgetAiAction[];
