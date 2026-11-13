/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ClipboardProvider } from '@/application/interfaces/clipboardProvider';

interface Deps {
  clipboardProvider: ClipboardProvider;
}

export function createCopyImageAtIntoClipboardUseCase({ clipboardProvider }: Deps) {
  // The arguments come from the renderer over IPC: checked here, not trusted by type.
  return async function copyImageAtIntoClipboardUseCase(webContentsId: unknown, x: unknown, y: unknown) {
    if (!Number.isInteger(webContentsId) || !Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error('Invalid copy image arguments');
    }
    clipboardProvider.copyImageAt(webContentsId as number, Math.round(x as number), Math.round(y as number));
  }
}

export type CopyImageAtIntoClipboardUseCase = ReturnType<typeof createCopyImageAtIntoClipboardUseCase>;
