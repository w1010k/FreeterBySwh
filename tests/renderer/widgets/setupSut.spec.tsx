/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { setupWidgetSut } from '@tests/widgets/setupSut';
import calculator from '@/widgets/calculator';
import clock from '@/widgets/clock';
import { Settings as CalculatorSettings } from '@/widgets/calculator/settings';
import { Settings as ClockSettings } from '@/widgets/clock/settings';

const clockSettings: ClockSettings = { entries: [], hour12: false, showSeconds: false, showDate: false };

describe('setupWidgetSut()', () => {
  it('gives the widget only the modules its type declares in requiresApi', () => {
    const { widgetApi } = setupWidgetSut(calculator, {} as CalculatorSettings);
    expect(widgetApi.clipboard).toBeDefined();
    expect(widgetApi.dataStorage).toBeUndefined();
    expect(widgetApi.shell).toBeUndefined();
  });

  it('gives no module to a type without requiresApi', () => {
    const { widgetApi } = setupWidgetSut(clock, clockSettings);
    expect(widgetApi.clipboard).toBeUndefined();
    expect(widgetApi.updateActionBar).toBeDefined();
  });

  it('refuses a mock of a module the widget type does not declare', () => {
    expect(() => setupWidgetSut(calculator, {} as CalculatorSettings, { mockWidgetApi: { shell: { openPath: jest.fn() } } }))
      .toThrow('mockWidgetApi mocks shell');
  });
});
