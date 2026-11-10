/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { render, screen } from '@testing-library/react';
import { Button } from '@/ui/components/basic/button';
import { SettingBlock } from '@/ui/components/basic/settingsScreen/setting';

describe('accessible names', () => {
  it('a button with a caption is named by it; the title only adds a tooltip', () => {
    render(<Button caption='Save' title='Save the settings'/>);

    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('title', 'Save the settings');
  });

  it('an icon button is named by its title', () => {
    render(<Button title='Delete Widget'/>);

    expect(screen.getByRole('button', { name: 'Delete Widget' })).toBeInTheDocument();
  });

  it('a setting help icon is a Tab stop that reads its text, and stays out of the control name', () => {
    render(<SettingBlock title='Timer' titleForId='mins' moreInfo='Minutes to count down'><select id='mins'/></SettingBlock>);

    expect(screen.getByRole('combobox', { name: 'Timer' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Minutes to count down' })).toHaveAttribute('tabindex', '0');
  });
});
