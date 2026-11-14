/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Settings } from '@/widgets/commander/settings';
import widgetType from '@/widgets/commander'
import { screen } from '@testing-library/react';
import { SetupWidgetSutOptional, setupWidgetSut } from '@tests/widgets/setupSut'
import { fixtureSettings } from './fixtures';

function setupCommanderWidgetSut(settings: Settings, optional?: SetupWidgetSutOptional) {
  const { comp, ...rest } = setupWidgetSut(widgetType, settings, optional);
  return {
    comp,
    ...rest
  }
}

describe('Commander Widget', () => {
  it('exposes runCommands for AI actions, doing what a click does', () => {
    const exposeApi = jest.fn();
    const execCmdLines = jest.fn();
    setupCommanderWidgetSut(fixtureSettings({ cmds: ['', 'cmd1'], cwd: 'C:/r' }), { mockWidgetApi: { exposeApi, terminal: { execCmdLines } } });
    (exposeApi.mock.calls.at(-1)?.[0] as { runCommands: () => void }).runCommands();
    expect(execCmdLines).toHaveBeenCalledWith(['cmd1'], 'C:/r');
  });
  it('should render a "not configured" note, if cmds is empty', () => {
    setupCommanderWidgetSut(fixtureSettings({ cmds: [] }));

    expect(screen.getByText(/no commands set/i)).toBeInTheDocument();
  })
  it('should render a "not configured" note, if all cmds are empty strings', () => {
    setupCommanderWidgetSut(fixtureSettings({ cmds: ['', ''] }));

    expect(screen.getByText(/no commands set/i)).toBeInTheDocument();
  })

  it('should render a button with "Run Command" title, if cmds has only one non-empty string', () => {
    setupCommanderWidgetSut(fixtureSettings({ cmds: ['', 'cmd1'] }));

    expect(screen.getByRole('button', { name: /run Command/i })).toBeInTheDocument();
  })

  it('should render a button with "Run Commands" title, if cmds has multiple non-empty string', () => {
    setupCommanderWidgetSut(fixtureSettings({ cmds: ['', 'cmd1', 'cmd2'] }));

    expect(screen.getByRole('button', { name: /run Commands/i })).toBeInTheDocument();
  })

  it('should call execCmdLines with non-empty cmds and cwd, when clicking the execute button', async () => {
    const execCmdLines = jest.fn();
    const { userEvent } = setupCommanderWidgetSut(
      fixtureSettings({ cmds: ['', 'cmd1', '', 'cmd2'], cwd: 'some/dir' }),
      {
        mockWidgetApi: {
          terminal: {
            execCmdLines
          }
        }
      }
    );

    await userEvent.click(screen.getByRole('button', { name: /run Commands/i }))

    expect(execCmdLines).toHaveBeenCalledTimes(1);
    expect(execCmdLines).toHaveBeenCalledWith(['cmd1', 'cmd2'], 'some/dir');
  })

  it('should call execCmdLines with cwd=undefined, when cwd setting is empty', async () => {
    const execCmdLines = jest.fn();
    const { userEvent } = setupCommanderWidgetSut(
      fixtureSettings({ cmds: ['cmd1', 'cmd2'], cwd: '' }),
      {
        mockWidgetApi: {
          terminal: {
            execCmdLines
          }
        }
      }
    );

    await userEvent.click(screen.getByRole('button', { name: /run Commands/i }))

    expect(execCmdLines).toHaveBeenCalledTimes(1);
    expect(execCmdLines).toHaveBeenCalledWith(['cmd1', 'cmd2'], undefined);
  })
})
