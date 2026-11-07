/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { WidgetAiAction } from '@/widgets/appModules';
import { createTriggerAiAction, listForConfirm, nonEmptyStrings } from '@/widgets/aiTrigger';
import { SettingsType } from '@/widgets/file-opener/settingsType';

export const fileOpenerAiActions: WidgetAiAction[] = [createTriggerAiAction({
  name: 'openFiles',
  description: 'Open the widget\'s files or folders (same as clicking it).',
  apiKey: 'openFiles',
  describe: (widgetName, settings) => {
    const s = settings as { type?: unknown; files?: unknown; folders?: unknown } | undefined;
    const isFolder = s?.type === SettingsType.Folder;
    const paths = nonEmptyStrings(isFolder ? s?.folders : s?.files);
    return `Open ${paths.length} ${isFolder ? 'folder' : 'file'}(s) from "${widgetName}": ${listForConfirm(paths)}`;
  }
})] as WidgetAiAction[];
