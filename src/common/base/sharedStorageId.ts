/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

/**
 * Composite id used as the key in the shared-data `ObjectManager`. Encodes
 * the widget type alongside the user-assigned key id so different widget
 * types have independent key namespaces (e.g. a note key named "Todo" is
 * different from a to-do-list key named "Todo").
 */
export function sharedStorageId(widgetType: string, sharedKeyId: string): string {
  return `${widgetType}:${sharedKeyId}`;
}

export function parseSharedStorageId(id: string): { widgetType: string; sharedKeyId: string } {
  const sep = id.indexOf(':');
  return sep >= 0
    ? { widgetType: id.slice(0, sep), sharedKeyId: id.slice(sep + 1) }
    : { widgetType: id, sharedKeyId: '' };
}
