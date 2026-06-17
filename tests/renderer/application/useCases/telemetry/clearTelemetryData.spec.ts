/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createClearTelemetryDataUseCase } from '@/application/useCases/telemetry/clearTelemetryData';

describe('clearTelemetryDataUseCase', () => {
  it('clears the telemetry storage', async () => {
    const clear = jest.fn(async () => undefined);
    const useCase = createClearTelemetryDataUseCase({ telemetryStorage: { clear } });

    await useCase();

    expect(clear).toHaveBeenCalledTimes(1);
  });
})
