/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

/**
 * Composite id used as the key in `sharedDataStorageManager`. Encodes the
 * widget type alongside the user-assigned key id so different widget types
 * have independent key namespaces.
 */
export function sharedStorageId(widgetType: string, sharedKeyId: string): string {
  return `${widgetType}:${sharedKeyId}`;
}
