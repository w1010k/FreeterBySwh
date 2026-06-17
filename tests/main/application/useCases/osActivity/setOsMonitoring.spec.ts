/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createSetOsMonitoringUseCase } from '@/application/useCases/osActivity/setOsMonitoring';

describe('setOsMonitoringUseCase', () => {
  it('starts the monitor when enabled, stops it when disabled', () => {
    const osActivityMonitor = { start: jest.fn(), stop: jest.fn() };
    const useCase = createSetOsMonitoringUseCase({ osActivityMonitor });

    useCase(true);
    expect(osActivityMonitor.start).toHaveBeenCalledTimes(1);
    expect(osActivityMonitor.stop).not.toHaveBeenCalled();

    useCase(false);
    expect(osActivityMonitor.stop).toHaveBeenCalledTimes(1);
  });
})
