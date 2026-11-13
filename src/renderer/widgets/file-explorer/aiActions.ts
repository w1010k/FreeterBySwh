/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { WidgetAiAction } from '@/widgets/appModules';
import { FsSearchResult } from '@common/base/fs';

/** A search hit as the agent gets it: the full path, and the location as the widget shows it. */
export interface FileExplorerAiHit {
  name: string;
  path: string;
  isDirectory: boolean;
  location: string;
}

/** Exposed by the widget (`exposeApi({ fileExplorer })`): the same search as its search box. */
export interface FileExplorerAiApi {
  search(query: string): Promise<{ hits: FileExplorerAiHit[]; limit: FsSearchResult['limit'] }>;
}

const maxQueryChars = 200;

const search: WidgetAiAction<{ query: string }> = {
  name: 'search',
  description: 'Find files and folders by name in every subfolder of the widget\'s folders, like its search box: the name '
    + 'contains the query, ignoring case. Returns up to 200 hits with full paths. limit is null when everything was searched, '
    + '"results" when there are more matches (use a longer query), "scanned" when some folders were too large to search.',
  kind: 'read',
  properties: { query: { type: 'string', minLength: 1, maxLength: maxQueryChars } },
  required: ['query'],
  parse: (input) => (typeof input.query === 'string' && input.query.trim() !== '' && input.query.length <= maxQueryChars
    ? { query: input.query }
    : undefined),
  describe: ({ query }, widgetName) => `Search "${query}" in file explorer widget "${widgetName}"`,
  run: async ({ api }, { query }) => {
    const fileExplorer = api.fileExplorer as FileExplorerAiApi | undefined;
    if (typeof fileExplorer?.search !== 'function') {
      return { ok: false, code: 'not_ready', message: 'The widget is not ready' };
    }
    try {
      return { ok: true, value: await fileExplorer.search(query) };
    } catch {
      return { ok: false, code: 'failed', message: 'The search failed' };
    }
  }
};

export const fileExplorerAiActions: WidgetAiAction[] = [search] as WidgetAiAction[];
