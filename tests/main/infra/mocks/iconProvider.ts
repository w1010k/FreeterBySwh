/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { IconProvider } from '@/application/interfaces/iconProvider';

const iconProvider: IconProvider = {
  getFileIcon: jest.fn(),
  getFavicon: jest.fn(),
}

export const mockIconProvider = (props: Partial<IconProvider>) => ({ ...iconProvider, ...props });
