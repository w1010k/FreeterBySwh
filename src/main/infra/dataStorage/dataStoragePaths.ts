/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { basename, join } from 'node:path';
import { parseSharedStorageId } from '@common/base/sharedStorageId';

// The ids come from the renderer over IPC. Each must be one folder name: an empty id (the folder itself, whose
// clear() would wipe every widget's data), `.`, `..` or a name with a separator (`a/../b` reaching another widget
// type's storage, `x/y` nesting under widget `x`) is refused, so an id cannot point outside its storage folder or at
// the folder itself. Ids that Windows maps to another name (a trailing dot, a device name) are not checked: a renderer
// that can send them can send the other widget's real id anyway.
function subfolder(dir: string, name: string, what: string): string {
  if (name === '' || name === '.' || name === '..' || basename(name) !== name) {
    throw new Error(`Invalid ${what}: ${JSON.stringify(name)}`);
  }
  return join(dir, name);
}

/** The folder of a widget's own data: `<appDataDir>/widgets/<widgetId>`. */
export function widgetDataStoragePath(appDataDir: string, widgetId: string): string {
  return subfolder(join(appDataDir, 'widgets'), widgetId, 'widget id');
}

/**
 * The folder of a shared data key: `<appDataDir>/shared/<widgetType>/<sharedKeyId>`, so namespaces are isolated per
 * widget type. `id` is a `sharedStorageId`.
 */
export function sharedDataStoragePath(appDataDir: string, id: string): string {
  const { widgetType, sharedKeyId } = parseSharedStorageId(id);
  const typeDir = subfolder(join(appDataDir, 'shared'), widgetType, 'widget type');
  return subfolder(typeDir, sharedKeyId, 'shared data key');
}
