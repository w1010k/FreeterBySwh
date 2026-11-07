/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { WidgetAiAction } from '@/widgets/appModules';

/** Web pages only: the webview would also load file:// or javascript: URLs. */
function isWebUrl(v: unknown): v is string {
  if (typeof v !== 'string') {
    return false;
  }
  try {
    const { protocol } = new URL(v);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

const navigate: WidgetAiAction<{ url: string }> = {
  name: 'navigate',
  description: 'Open an http(s) URL in the widget\'s embedded page.',
  kind: 'write',
  properties: { url: { type: 'string', format: 'uri' } },
  required: ['url'],
  parse: (input) => (isWebUrl(input.url) ? { url: input.url } : undefined),
  describe: ({ url }, widgetName) => `Open ${url} in webpage widget "${widgetName}"`,
  run: ({ api }, { url }) => {
    // The widget already exposes openUrl for other widgets (Web Query).
    if (typeof api.openUrl !== 'function') {
      return { ok: false, code: 'not_ready', message: 'The page is not ready' };
    }
    api.openUrl(url);
    return { ok: true, value: null };
  }
};

export const webpageAiActions: WidgetAiAction[] = [navigate] as WidgetAiAction[];
