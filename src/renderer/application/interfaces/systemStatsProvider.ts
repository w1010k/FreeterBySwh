/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { SystemStats } from '@common/base/systemStats';

export interface SystemStatsProvider {
  getStats(): Promise<SystemStats>;
}
