/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { OsActivityMonitor } from '@/application/osActivity/osActivityMonitor';

interface Deps {
  osActivityMonitor: OsActivityMonitor;
}

export function createSetOsMonitoringUseCase({ osActivityMonitor }: Deps) {
  return function setOsMonitoringUseCase(enabled: boolean): void {
    if (enabled) {
      osActivityMonitor.start();
    } else {
      osActivityMonitor.stop();
    }
  }
}

export type SetOsMonitoringUseCase = ReturnType<typeof createSetOsMonitoringUseCase>;
