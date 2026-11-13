/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ClipboardProvider } from '@/application/interfaces/clipboardProvider';
import { createCopyImageAtIntoClipboardUseCase } from '@/application/useCases/clipboard/copyImageAtIntoClipboard';

function setup() {
  const clipboardProvider: ClipboardProvider = { writeBookmark: jest.fn(), writeText: jest.fn(), copyImageAt: jest.fn() };
  return { clipboardProvider, useCase: createCopyImageAtIntoClipboardUseCase({ clipboardProvider }) };
}

describe('copyImageAtIntoClipboardUseCase()', () => {
  it('copies the image at the point, rounded to whole pixels', async () => {
    const { useCase, clipboardProvider } = setup();

    await useCase(7, 10.4, 20.6);

    expect(clipboardProvider.copyImageAt).toHaveBeenCalledWith(7, 10, 21);
  });

  it.each([
    ['a non-integer id', 7.5, 1, 1],
    ['a string id', '7', 1, 1],
    ['a missing x', 7, undefined, 1],
    ['an infinite y', 7, 1, Infinity],
  ])('rejects %s', async (_name, id, x, y) => {
    const { useCase, clipboardProvider } = setup();

    await expect(useCase(id, x, y)).rejects.toThrow();
    expect(clipboardProvider.copyImageAt).not.toHaveBeenCalled();
  });
});
