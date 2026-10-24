/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { DataStorageRenderer } from '@/application/interfaces/dataStorage';
import { IdGenerator } from '@/application/interfaces/idGenerator';
import { Widget } from '@/base/widget';
import { ObjectManager } from '@common/base/objectManager';

export class WidgetCloneError extends Error {}

type Deps = {
  widgetDataStorageManager: ObjectManager<DataStorageRenderer>;
  idGenerator: IdGenerator;
  onCopyError?: (error: unknown) => void;
}
export function createCloneWidgetSubCase({
  widgetDataStorageManager,
  idGenerator,
  onCopyError,
}: Deps) {
  async function subCase(widget: Widget): Promise<Widget> {
    const newWidget: Widget = {
      ...widget,
      id: idGenerator()
    }
    try {
      if (!await widgetDataStorageManager.copyObjectData(widget.id, newWidget.id)) {
        throw new Error('Could not copy widget data');
      }
    } catch (error) {
      onCopyError?.(error);
      throw new WidgetCloneError('Widget data copy failed');
    }
    return newWidget;
  }

  return subCase;
}

export type CloneWidgetSubCase = ReturnType<typeof createCloneWidgetSubCase>;


// Only the already reported copy failure is handled here. Other errors remain visible.
export function stopOnWidgetCloneError<Args extends unknown[]>(
  useCase: (...args: Args) => Promise<void>,
  onAbort?: () => void,
): (...args: Args) => Promise<void> {
  return async (...args) => {
    try {
      await useCase(...args);
    } catch (error) {
      if (!(error instanceof WidgetCloneError)) {
        throw error;
      }
      onAbort?.();
    }
  };
}
