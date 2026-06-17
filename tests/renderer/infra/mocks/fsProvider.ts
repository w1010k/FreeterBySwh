/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { FsProvider } from '@/application/interfaces/fsProvider';

const fsProvider: FsProvider = {
  readDir: jest.fn(async () => []),
  getHomeDir: jest.fn(async () => ''),
  getImageDataUrl: jest.fn(async () => null),
  writeTextFile: jest.fn(async () => true),
}

export const mockFsProvider = (props: Partial<FsProvider>) => ({ ...fsProvider, ...props });
