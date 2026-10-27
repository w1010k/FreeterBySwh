/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { widgetComp } from '@/widgets/system-monitor/widget';
import { Settings } from '@/widgets/system-monitor/settings';
import { SystemStats } from '@common/base/systemStats';
import { act, screen, waitFor } from '@testing-library/react';
import { setupWidgetSut } from '@tests/widgets/setupSut';

const stats: SystemStats = {
  cpuPercent: 42,
  cpuCorePercents: [10, 90],
  memUsedBytes: 8 * 1024 ** 3,
  memTotalBytes: 16 * 1024 ** 3,
  appCpuPercent: 3,
  appMemBytes: 512 * 1024 ** 2,
  disk: { usedBytes: 1024 ** 3, totalBytes: 4 * 1024 ** 3 },
  uptimeSec: 3720,
};

function mockBattery(battery: { level: number; charging: boolean; chargingTime: number }) {
  const mgr = Object.assign(new EventTarget(), battery);
  Object.defineProperty(navigator, 'getBattery', { configurable: true, value: () => Promise.resolve(mgr) });
}

describe('System Monitor Widget', () => {
  afterEach(() => {
    delete (navigator as { getBattery?: unknown }).getBattery;
  });

  it('polls system stats and displays CPU, RAM, disk, Freeter usage and uptime', async () => {
    const getStats = jest.fn().mockResolvedValue(stats);
    setupWidgetSut(widgetComp, {} as Settings, { mockWidgetApi: { systemStats: { getStats } } });

    await waitFor(() => {
      expect(screen.getByText('42%')).toBeInTheDocument(); // CPU
      expect(screen.getByText('50%')).toBeInTheDocument(); // RAM 8/16
    });
    expect(screen.getByText('8.0 GB / 16.0 GB')).toBeInTheDocument();
    expect(screen.getByTitle('Per-core usage').children).toHaveLength(2);
    expect(screen.getByText('25%')).toBeInTheDocument(); // Disk 1/4
    expect(screen.getByText('1.0 GB / 4.0 GB')).toBeInTheDocument();
    expect(screen.getByText('3%')).toBeInTheDocument(); // Freeter CPU
    expect(screen.getByText('512 MB')).toBeInTheDocument();
    expect(screen.getByText('Uptime 1h 2m')).toBeInTheDocument();
    expect(screen.queryByText('Battery')).not.toBeInTheDocument(); // jsdom has no getBattery
    expect(getStats).toHaveBeenCalled();
  });

  it('hides the disk row when the disk could not be read', async () => {
    const getStats = jest.fn().mockResolvedValue({ ...stats, disk: null });
    setupWidgetSut(widgetComp, {} as Settings, { mockWidgetApi: { systemStats: { getStats } } });

    await waitFor(() => expect(screen.getByText('42%')).toBeInTheDocument());
    expect(screen.queryByText('Disk')).not.toBeInTheDocument();
  });

  it('shows the battery level and charging state', async () => {
    mockBattery({ level: 0.8, charging: false, chargingTime: Infinity });
    const getStats = jest.fn().mockResolvedValue(stats);
    setupWidgetSut(widgetComp, {} as Settings, { mockWidgetApi: { systemStats: { getStats } } });

    expect(await screen.findByText('Battery')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('On battery')).toBeInTheDocument();
  });

  it('hides the battery row when the API reports no battery', async () => {
    mockBattery({ level: 1, charging: true, chargingTime: 0 });
    const getStats = jest.fn().mockResolvedValue(stats);
    setupWidgetSut(widgetComp, {} as Settings, { mockWidgetApi: { systemStats: { getStats } } });

    await waitFor(() => expect(screen.getByText('42%')).toBeInTheDocument());
    await act(async () => { /* let getBattery() resolve before asserting absence */ });
    expect(screen.queryByText('Battery')).not.toBeInTheDocument();
  });
});
