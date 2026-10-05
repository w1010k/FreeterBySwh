/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

// Holds every writeFile until the test releases it, so the test decides when
// the bytes land on "disk" and can check what a read issued meanwhile returns.
const mockReleases: Array<() => void> = [];
let mockDisk = 'old';
jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn(async () => undefined),
  readFile: jest.fn(async () => mockDisk),
  writeFile: jest.fn((_path: string, data: string) => new Promise<void>(resolve => {
    mockReleases.push(() => {
      mockDisk = data;
      resolve();
    });
  })),
}));
jest.mock('node:original-fs', () => ({ existsSync: () => false }), { virtual: true });

import { createFileDataStorage } from '@/infra/dataStorage/fileDataStorage';

describe('FileDataStorage operation order', () => {
  it('should make a read issued right after a write wait for that write', async () => {
    const storage = await createFileDataStorage('string', 'dir');
    const write = storage.setText('sheet', 'new');
    const read = storage.getText('sheet');
    // Let the queued work start: the write is now in flight and still held.
    await new Promise(resolve => setImmediate(resolve));
    expect(mockReleases).toHaveLength(1);

    mockReleases[0]();
    await write;
    expect(await read).toBe('new');
  });
});
