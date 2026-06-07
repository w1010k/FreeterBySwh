/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { widgetComp } from '@/widgets/system-monitor/widget';
import { Settings } from '@/widgets/system-monitor/settings';
import { screen, waitFor } from '@testing-library/react';
import { setupWidgetSut } from '@tests/widgets/setupSut';

describe('System Monitor Widget', () => {
  it('polls system stats and displays CPU% and RAM usage', async () => {
    const getStats = jest.fn().mockResolvedValue({
      cpuPercent: 42,
      memUsedBytes: 8 * 1024 ** 3,
      memTotalBytes: 16 * 1024 ** 3,
    });
    setupWidgetSut(widgetComp, {} as Settings, { mockWidgetApi: { systemStats: { getStats } } });

    await waitFor(() => {
      expect(screen.getByText('42%')).toBeInTheDocument(); // CPU
      expect(screen.getByText('50%')).toBeInTheDocument(); // RAM 8/16
    });
    expect(screen.getByText('8.0 GB / 16.0 GB')).toBeInTheDocument();
    expect(getStats).toHaveBeenCalled();
  });
});
