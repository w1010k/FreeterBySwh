/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { widgetComp } from '@/widgets/calculator/widget';
import { Settings } from '@/widgets/calculator/settings';
import { screen } from '@testing-library/react';
import { setupWidgetSut } from '@tests/widgets/setupSut';

function setup() {
  return setupWidgetSut(widgetComp, {} as Settings);
}

describe('Calculator Widget', () => {
  it('computes via button clicks (7 + 8 = 15)', async () => {
    const { userEvent } = setup();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '7' }));
    await user.click(screen.getByRole('button', { name: '+' }));
    await user.click(screen.getByRole('button', { name: '8' }));
    await user.click(screen.getByRole('button', { name: '=' }));

    expect(screen.getByTestId('calc-display')).toHaveTextContent('15');
  });

  it('resets the display with C', async () => {
    const { userEvent } = setup();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '7' }));
    await user.click(screen.getByRole('button', { name: 'C' }));

    expect(screen.getByTestId('calc-display')).toHaveTextContent('0');
  });

  it('copies the result to the clipboard on display click, flashing "Copied"', async () => {
    const { userEvent, widgetApi } = setup();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '7' }));
    await user.click(screen.getByTestId('calc-display'));

    expect(widgetApi.clipboard.writeText).toHaveBeenCalledWith('7');
    expect(screen.getByTestId('calc-display')).toHaveTextContent('Copied');
  });
});
