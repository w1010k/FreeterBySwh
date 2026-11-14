/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Settings } from '@/widgets/_template/settings';
import widgetType from '@/widgets/_template'
import { screen } from '@testing-library/react';
import { setupWidgetSut } from '@tests/widgets/setupSut'

describe('Template Widget', () => {
  it('should show text specified in the settings', () => {
    const settings: Settings = { text: 'SOME TEXT VALUE' };
    setupWidgetSut(widgetType, settings);

    expect(screen.getByText(settings.text)).toBeInTheDocument();
  })
})
