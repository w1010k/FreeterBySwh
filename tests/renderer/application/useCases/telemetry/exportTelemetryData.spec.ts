/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createExportTelemetryDataUseCase } from '@/application/useCases/telemetry/exportTelemetryData';
import { mockDialogProvider } from '@tests/infra/mocks/dialogProvider';
import { mockFsProvider } from '@tests/infra/mocks/fsProvider';

function setup(over?: { canceled?: boolean; filePath?: string; writeOk?: boolean }) {
  const readTelemetryEventsUseCase = jest.fn(async () => [{ date: '2026-06-17', events: [{ ts: 1, type: 'app_focus' as const }] }]);
  const getTelemetryRollupsUseCase = jest.fn(async () => []);
  const getTelemetryEntitiesUseCase = jest.fn(() => ({ projects: [], workflows: [], widgets: [] }));
  const dialogProvider = mockDialogProvider({
    showSaveFileDialog: jest.fn(async () => ({ canceled: over?.canceled ?? false, filePath: over?.filePath ?? '/out/export.json' })),
  });
  const fsProvider = mockFsProvider({ writeTextFile: jest.fn(async () => over?.writeOk ?? true) });
  const useCase = createExportTelemetryDataUseCase({
    readTelemetryEventsUseCase, getTelemetryRollupsUseCase, getTelemetryEntitiesUseCase, dialogProvider, fsProvider,
  });
  return { useCase, dialogProvider, fsProvider };
}

describe('exportTelemetryDataUseCase', () => {
  it('writes the bundle JSON to the chosen path and returns saved', async () => {
    const { useCase, fsProvider } = setup({ filePath: '/out/export.json' });

    const res = await useCase();

    expect(res).toEqual({ status: 'saved', filePath: '/out/export.json' });
    expect(fsProvider.writeTextFile).toHaveBeenCalledTimes(1);
    const [path, text] = (fsProvider.writeTextFile as jest.Mock).mock.calls[0];
    expect(path).toBe('/out/export.json');
    expect(() => JSON.parse(text)).not.toThrow();
    expect(JSON.parse(text).manifest.eventCount).toBe(1);
  });

  it('returns canceled when the user dismisses the save dialog', async () => {
    const { useCase, fsProvider } = setup({ canceled: true });

    const res = await useCase();

    expect(res).toEqual({ status: 'canceled' });
    expect(fsProvider.writeTextFile).not.toHaveBeenCalled();
  });

  it('returns error when the write fails', async () => {
    const { useCase } = setup({ writeOk: false });

    expect(await useCase()).toEqual({ status: 'error' });
  });
})
