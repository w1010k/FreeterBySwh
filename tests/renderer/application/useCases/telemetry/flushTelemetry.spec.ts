/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createFlushTelemetryUseCase } from '@/application/useCases/telemetry/flushTelemetry';
import { TelemetryCollector } from '@/application/telemetry/telemetryCollector';

describe('flushTelemetryUseCase', () => {
  it('marks the active boundary before flushing (in-progress active time is captured)', async () => {
    const calls: string[] = [];
    const collector = {
      markActiveBoundary: jest.fn(() => { calls.push('boundary'); }),
      flush: jest.fn(async () => { calls.push('flush'); }),
    } as unknown as TelemetryCollector;

    await createFlushTelemetryUseCase({ telemetryCollector: collector })();

    expect(calls).toEqual(['boundary', 'flush']);
  });
})
