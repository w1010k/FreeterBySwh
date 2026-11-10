/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { ModalScreen } from '@/ui/components/basic/modalScreen';
import { SettingsScreen } from '@/ui/components/basic/settingsScreen';

describe('<ModalScreen />', () => {
  it('is a modal dialog named by its title', () => {
    render(<ModalScreen title="Settings" buttons={[]}/>);

    expect(screen.getByRole('dialog', { name: 'Settings' })).toHaveAttribute('aria-modal', 'true');
  });

  it('runs onEscape for Escape, also when the focus is on the body', () => {
    const onEscape = jest.fn();
    render(<ModalScreen title="Settings" buttons={[]} onEscape={onEscape}><input aria-label="field"/></ModalScreen>);

    fireEvent.keyDown(screen.getByLabelText('field'), { key: 'Escape' });
    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(onEscape).toHaveBeenCalledTimes(2);
  });

  it('leaves Escape to a field that handled it, to an IME composition, and ignores a held key', () => {
    const onEscape = jest.fn();
    render(
      <ModalScreen title="Settings" buttons={[]} onEscape={onEscape}>
        <input aria-label="field" onKeyDown={e => e.key === 'Escape' && e.preventDefault()}/>
        <input aria-label="other"/>
      </ModalScreen>
    );

    fireEvent.keyDown(screen.getByLabelText('field'), { key: 'Escape' });
    fireEvent.keyDown(screen.getByLabelText('other'), { key: 'Escape', isComposing: true });
    fireEvent.keyDown(screen.getByLabelText('other'), { key: 'Escape', repeat: true });

    expect(onEscape).not.toHaveBeenCalled();
  });

  it('does not answer Escape while a screen above makes it inert', () => {
    const onEscape = jest.fn();
    render(<div {...{ inert: true }}><ModalScreen title="Settings" buttons={[]} onEscape={onEscape}/></div>);

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(onEscape).not.toHaveBeenCalled();
  });

  it('takes the focus when it mounts on top, but not under an inert screen', () => {
    const { unmount } = render(<ModalScreen title="Top" buttons={[]}/>);
    expect(screen.getByRole('dialog')).toHaveFocus();
    unmount();

    render(<div {...{ inert: true }}><ModalScreen title="Below" buttons={[]}/></div>);
    expect(document.body).toHaveFocus();
  });

  it('settings screens do not close on Escape (Cancel would drop their edits)', () => {
    const onCancelClick = jest.fn();
    render(<SettingsScreen title="Settings" onOkClick={jest.fn()} onCancelClick={onCancelClick}/>);

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(onCancelClick).not.toHaveBeenCalled();
  });
});
