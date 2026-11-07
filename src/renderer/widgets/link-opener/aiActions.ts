/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { WidgetAiAction } from '@/widgets/appModules';
import { createTriggerAiAction, listForConfirm, nonEmptyStrings } from '@/widgets/aiTrigger';

export const linkOpenerAiActions: WidgetAiAction[] = [createTriggerAiAction({
  name: 'openLinks',
  description: 'Open the widget\'s links in the default web browser (same as clicking it).',
  apiKey: 'openLinks',
  describe: (widgetName, settings) => {
    const urls = nonEmptyStrings((settings as { urls?: unknown } | undefined)?.urls);
    return `Open ${urls.length} links from "${widgetName}": ${listForConfirm(urls)}`;
  }
})] as WidgetAiAction[];
