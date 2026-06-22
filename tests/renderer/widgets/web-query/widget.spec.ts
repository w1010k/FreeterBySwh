/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Settings, SettingsMode, defaultEngine, enginePlaceholder, enginesById } from '@/widgets/web-query/settings';
import { widgetComp } from '@/widgets/web-query/widget'
import { act, screen, waitFor } from '@testing-library/react';
import { SetupWidgetSutOptional, setupWidgetSut } from '@tests/widgets/setupSut'
import { fixtureEntry, fixtureSettings1 } from './fixtures';
import { WebpageExposedApi } from '@/widgets/interfaces';
import { WidgetApiWidget, WidgetContextMenuFactory } from '@/widgets/appModules';
import { labelClearHistory } from '@/widgets/web-query/contextMenu';

function setupSut(settings: Settings, optional?: SetupWidgetSutOptional) {
  const { comp, ...rest } = setupWidgetSut(widgetComp, settings, optional);
  return {
    comp,
    ...rest
  }
}

describe('Web Query Widget', () => {
  describe('Browser mode', () => {
    it('should render an "Invalid URL template" note, if engine=custom and url is empty', () => {
      setupSut(fixtureSettings1(SettingsMode.Browser, { engine: '', url: '' }));

      expect(screen.getByText(/Invalid URL template/i)).toBeInTheDocument();
    })

    it('should render an "Invalid URL template" note, if engine=custom and url is invalid', () => {
      setupSut(fixtureSettings1(SettingsMode.Browser, { engine: '', url: 'invalid^url/QUERY' }));

      expect(screen.getByText(/Invalid URL template/i)).toBeInTheDocument();
    })

    it('should not render an "Invalid URL template" note, if engine!=custom and url is invalid', () => {
      setupSut(fixtureSettings1(SettingsMode.Browser, { engine: defaultEngine.id, url: 'invalid^url/QUERY' }));

      expect(screen.queryByText(/Invalid URL template/i)).not.toBeInTheDocument();
    })

    it('should render a "Missing QUERY in URL template" note, if engine=custom and url does not have QUERY', () => {
      setupSut(fixtureSettings1(SettingsMode.Browser, { engine: '', url: 'https://freeter.io/' }));

      expect(screen.getByText(/Missing QUERY in URL template/i)).toBeInTheDocument();
    })

    it('should not render a "Missing QUERY in URL template" note, if engine!=custom and url does not have QUERY', () => {
      setupSut(fixtureSettings1(SettingsMode.Browser, { engine: defaultEngine.id, url: 'https://freeter.io/' }));

      expect(screen.queryByText(/Missing QUERY in URL template/i)).not.toBeInTheDocument();
    })

    it('should render a "Missing QUERY in Query template" note, if query does not have QUERY', () => {
      setupSut(fixtureSettings1(SettingsMode.Browser, { engine: '', url: 'https://freeter.io/QUERY', query: 'non-uppercase-query' }));

      expect(screen.getByText(/Missing QUERY in Query template/i)).toBeInTheDocument();
    })

    it('should not render a "Missing QUERY in Query template" note, if query is empty', () => {
      setupSut(fixtureSettings1(SettingsMode.Browser, { engine: '', url: 'https://freeter.io/QUERY', query: '' }));

      expect(screen.queryByText(/Missing QUERY in Query template/i)).not.toBeInTheDocument();
    })

    it('should render a text input and a button, when there are not any warning notes', () => {
      setupSut(fixtureSettings1(SettingsMode.Browser, { engine: '', url: 'https://freeter.io/QUERY', query: '' }));

      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /query/i })).toBeInTheDocument();
    })

    it('should not render a text input and a button, when there is a warning notes', () => {
      setupSut(fixtureSettings1(SettingsMode.Browser, { engine: '', url: '', query: '' }));

      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /query/i })).not.toBeInTheDocument();
    })

    it('should set the descr setting value as a text input placeholder, when engine=custom', () => {
      const descr = 'Descr';
      setupSut(fixtureSettings1(SettingsMode.Browser, { engine: '', url: 'https://freeter.io/QUERY', query: '', descr }));

      expect(screen.getByRole('combobox')).toHaveProperty('placeholder', descr);
    })

    it('should set the engine-specific placeholder (descr + name), when engine!=custom', () => {
      setupSut(fixtureSettings1(SettingsMode.Browser, { engine: 'ovrs', query: '', descr: 'Descr' }));

      expect(screen.getByRole('combobox')).toHaveProperty('placeholder', enginePlaceholder(enginesById['ovrs']));
    })

    it('should set the default engine placeholder, when engine does not exist', () => {
      setupSut(fixtureSettings1(SettingsMode.Browser, { engine: 'NO-SUCH-ID', query: '', descr: 'Descr' }));

      expect(screen.getByRole('combobox')).toHaveProperty('placeholder', enginePlaceholder(defaultEngine));
    })

    it('should include the engine name in the placeholder (e.g. "Search Google")', () => {
      setupSut(fixtureSettings1(SettingsMode.Browser, { engine: 'goog', query: '' }));

      expect(screen.getByRole('combobox')).toHaveProperty('placeholder', 'Search Google');
    })

    it('should call openExternalUrl with right args on ENTER keypress in the text input', async () => {
      const someQuery = 'some query';
      const openExternalUrl = jest.fn();
      const { userEvent } = setupSut(
        fixtureSettings1(SettingsMode.Browser, { engine: 'goog', query: 'query QUERY', url: 'https://freeter.io/QUERY' }),
        {
          mockWidgetApi: {
            shell: {
              openExternalUrl
            }
          }
        }
      );
      const textbox = screen.getByRole('combobox');

      expect(openExternalUrl).not.toHaveBeenCalled();

      await userEvent.type(textbox, someQuery + '[enter]');

      expect(openExternalUrl).toHaveBeenCalledTimes(1);
      expect(openExternalUrl).toHaveBeenCalledWith('https://www.google.com/search?q=query%20some%20query');
    })

    it('should call openExternalUrl with right args on button press', async () => {
      const someQuery = 'some query';
      const openExternalUrl = jest.fn();
      const { userEvent } = setupSut(
        fixtureSettings1(SettingsMode.Browser, { engine: 'goog', query: 'query QUERY', url: 'https://freeter.io/QUERY' }),
        {
          mockWidgetApi: {
            shell: {
              openExternalUrl
            }
          }
        }
      );
      const textbox = screen.getByRole('combobox');
      const button = screen.getByRole('button', { name: /query/i });
      await userEvent.type(textbox, someQuery);

      expect(openExternalUrl).not.toHaveBeenCalled();

      await userEvent.click(button);

      expect(openExternalUrl).toHaveBeenCalledTimes(1);
      expect(openExternalUrl).toHaveBeenCalledWith('https://www.google.com/search?q=query%20some%20query');
    })

    it('should not request info about Webpage widgets on ENTER keypress in the text input', async () => {
      const someQuery = 'some query';
      const webpageWidgets: WidgetApiWidget<WebpageExposedApi>[] = [{
        id: '1',
        name: 'name',
        api: {}
      }]
      const getWidgetsInCurrentWorkflow = jest.fn().mockReturnValue(webpageWidgets);
      const { userEvent } = setupSut(
        fixtureSettings1(SettingsMode.Browser, { engine: 'goog', query: 'query QUERY', url: 'https://freeter.io/QUERY' }),
        {
          mockWidgetApi: {
            widgets: {
              getWidgetsInCurrentWorkflow
            }
          }
        }
      );
      const textbox = screen.getByRole('combobox');
      await userEvent.type(textbox, someQuery + '[enter]');

      expect(getWidgetsInCurrentWorkflow).not.toHaveBeenCalled();
    })

    it('should not request info about Webpage widgets on button press', async () => {
      const someQuery = 'some query';
      const webpageWidgets: WidgetApiWidget<WebpageExposedApi>[] = [{
        id: '1',
        name: 'name',
        api: {}
      }]
      const getWidgetsInCurrentWorkflow = jest.fn().mockReturnValue(webpageWidgets);
      const { userEvent } = setupSut(
        fixtureSettings1(SettingsMode.Browser, { engine: 'goog', query: 'query QUERY', url: 'https://freeter.io/QUERY' }),
        {
          mockWidgetApi: {
            widgets: {
              getWidgetsInCurrentWorkflow
            }
          }
        }
      );
      const textbox = screen.getByRole('combobox');
      const button = screen.getByRole('button', { name: /query/i });

      await userEvent.type(textbox, someQuery);
      await userEvent.click(button);

      expect(getWidgetsInCurrentWorkflow).not.toHaveBeenCalled();
    })

    it('should build a right url, when engine=custom', async () => {
      const someQuery = 'some query';
      const openExternalUrl = jest.fn();
      const { userEvent } = setupSut(
        fixtureSettings1(SettingsMode.Browser, { engine: '', query: 'query QUERY', url: 'freeter.io/QUERY' }),
        {
          mockWidgetApi: {
            shell: {
              openExternalUrl
            }
          }
        }
      );
      const textbox = screen.getByRole('combobox');

      await userEvent.type(textbox, someQuery + '[enter]');

      expect(openExternalUrl).toHaveBeenCalledWith('https://freeter.io/query%20some%20query');
    })

    it('should build a right url, when engine!=custom', async () => {
      const someQuery = 'some query';
      const openExternalUrl = jest.fn();
      const { userEvent } = setupSut(
        fixtureSettings1(SettingsMode.Browser, { engine: 'goog', query: 'query QUERY', url: 'freeter.io/QUERY' }),
        {
          mockWidgetApi: {
            shell: {
              openExternalUrl
            }
          }
        }
      );
      const textbox = screen.getByRole('combobox');

      await userEvent.type(textbox, someQuery + '[enter]');

      expect(openExternalUrl).toHaveBeenCalledWith('https://www.google.com/search?q=query%20some%20query');
    })

    it('should render one input row per entry and query each independently', async () => {
      const openExternalUrl = jest.fn();
      const { userEvent } = setupSut(
        {
          mode: SettingsMode.Browser,
          entries: [
            fixtureEntry({ id: 'e1', engine: 'goog', query: '' }),
            fixtureEntry({ id: 'e2', engine: 'bing', query: '' })
          ]
        },
        {
          mockWidgetApi: {
            shell: {
              openExternalUrl
            }
          }
        }
      );
      const textboxes = screen.getAllByRole('combobox');
      expect(textboxes).toHaveLength(2);

      await userEvent.type(textboxes[1], 'hello[enter]');

      expect(openExternalUrl).toHaveBeenCalledTimes(1);
      expect(openExternalUrl).toHaveBeenCalledWith('https://www.bing.com/search?q=hello');
    })

  })

  describe('Webpages mode', () => {
    it('should not render an "Invalid URL template" note, if engine=custom and url is empty', () => {
      setupSut(fixtureSettings1(SettingsMode.Webpages, { engine: '', url: '' }));

      expect(screen.queryByText(/Invalid URL template/i)).not.toBeInTheDocument();
    })

    it('should not render an "Invalid URL template" note, if engine=custom and url is invalid', () => {
      setupSut(fixtureSettings1(SettingsMode.Webpages, { engine: '', url: 'invalid^url/QUERY' }));

      expect(screen.queryByText(/Invalid URL template/i)).not.toBeInTheDocument();
    })

    it('should not render a "Missing QUERY in URL template" note, if engine=custom and url does not have QUERY', () => {
      setupSut(fixtureSettings1(SettingsMode.Webpages, { engine: '', url: 'https://freeter.io/' }));

      expect(screen.queryByText(/Missing QUERY in URL template/i)).not.toBeInTheDocument();
    })

    it('should render a "Missing QUERY in Query template" note, if query does not have QUERY', () => {
      setupSut(fixtureSettings1(SettingsMode.Webpages, { engine: '', url: 'https://freeter.io/QUERY', query: 'non-uppercase-query' }));

      expect(screen.getByText(/Missing QUERY in Query template/i)).toBeInTheDocument();
    })

    it('should not render a "Missing QUERY in Query template" note, if query is empty', () => {
      setupSut(fixtureSettings1(SettingsMode.Webpages, { engine: '', url: 'https://freeter.io/QUERY', query: '' }));

      expect(screen.queryByText(/Missing QUERY in Query template/i)).not.toBeInTheDocument();
    })

    it('should render a text input and a button, when there are not any warning notes', () => {
      setupSut(fixtureSettings1(SettingsMode.Webpages, { engine: '', url: '', query: '' }));

      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /query/i })).toBeInTheDocument();
    })

    it('should not render a text input and a button, when there is a warning note', () => {
      setupSut(fixtureSettings1(SettingsMode.Browser, { engine: '', url: '', query: 'non-uppercase-query' }));

      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /query/i })).not.toBeInTheDocument();
    })

    it('should set the descr setting value as a text input placeholder, when engine=custom', () => {
      const descr = 'Descr';
      setupSut(fixtureSettings1(SettingsMode.Webpages, { engine: '', url: '', query: '', descr }));

      expect(screen.getByRole('combobox')).toHaveProperty('placeholder', descr);
    })

    it('should set the descr setting value as a text input placeholder, when engine!=custom', () => {
      const descr = 'Descr';
      setupSut(fixtureSettings1(SettingsMode.Webpages, { engine: 'ovrs', query: '', descr }));

      expect(screen.getByRole('combobox')).toHaveProperty('placeholder', descr);
    })

    it('should set the descr setting value as a text input placeholder, when engine does not exist', () => {
      const descr = 'Descr';
      setupSut(fixtureSettings1(SettingsMode.Webpages, { engine: 'NO-SUCH-ID', query: '', descr }));

      expect(screen.getByRole('combobox')).toHaveProperty('placeholder', descr);
    })

    it('should not call openExternalUrl on ENTER keypress in the text input', async () => {
      const someQuery = 'some query';
      const webpageWidgets: WidgetApiWidget<WebpageExposedApi>[] = [{
        id: '1',
        name: 'name',
        api: {}
      }]
      const getWidgetsInCurrentWorkflow = jest.fn().mockReturnValue(webpageWidgets);
      const openExternalUrl = jest.fn();
      const { userEvent } = setupSut(
        fixtureSettings1(SettingsMode.Webpages, { engine: 'goog', query: 'query QUERY', url: 'https://freeter.io/QUERY' }),
        {
          mockWidgetApi: {
            shell: {
              openExternalUrl
            },
            widgets: {
              getWidgetsInCurrentWorkflow
            }
          }
        }
      );
      const textbox = screen.getByRole('combobox');

      await userEvent.type(textbox, someQuery + '[enter]');

      expect(openExternalUrl).not.toHaveBeenCalled();
    })

    it('should not call openExternalUrl on button press', async () => {
      const someQuery = 'some query';
      const webpageWidgets: WidgetApiWidget<WebpageExposedApi>[] = [{
        id: '1',
        name: 'name',
        api: {}
      }]
      const getWidgetsInCurrentWorkflow = jest.fn().mockReturnValue(webpageWidgets);
      const openExternalUrl = jest.fn();
      const { userEvent } = setupSut(
        fixtureSettings1(SettingsMode.Webpages, { engine: 'goog', query: 'query QUERY', url: 'https://freeter.io/QUERY' }),
        {
          mockWidgetApi: {
            shell: {
              openExternalUrl
            },
            widgets: {
              getWidgetsInCurrentWorkflow
            }
          }
        }
      );
      const textbox = screen.getByRole('combobox');
      const button = screen.getByRole('button', { name: /query/i });
      await userEvent.type(textbox, someQuery);

      await userEvent.click(button);

      expect(openExternalUrl).not.toHaveBeenCalled();
    })

    it('should correctly use api methods exposed by Webpage widgets on ENTER keypress in the text input', async () => {
      const someQuery = 'some query';
      const webpageWidgets: WidgetApiWidget<WebpageExposedApi>[] = [{
        id: '1',
        name: 'name',
        api: {
          getUrl: jest.fn(() => 'https://freeter.io/QUERY'),
          openUrl: jest.fn()
        }
      }]
      const getWidgetsInCurrentWorkflow = jest.fn().mockReturnValue(webpageWidgets);
      const { userEvent } = setupSut(
        fixtureSettings1(SettingsMode.Webpages, { engine: '', query: 'query QUERY', url: '' }),
        {
          mockWidgetApi: {
            widgets: {
              getWidgetsInCurrentWorkflow
            }
          }
        }
      );
      const textbox = screen.getByRole('combobox');

      expect(getWidgetsInCurrentWorkflow).not.toHaveBeenCalled();

      await userEvent.type(textbox, someQuery + '[enter]');

      expect(getWidgetsInCurrentWorkflow).toHaveBeenCalledTimes(1);
      expect(getWidgetsInCurrentWorkflow).toHaveBeenCalledWith('webpage');
      expect(webpageWidgets[0].api.openUrl).toHaveBeenCalledTimes(1);
      expect(webpageWidgets[0].api.openUrl).toHaveBeenCalledWith('https://freeter.io/query%20some%20query');
    })

    it('should correctly use api methods exposed by Webpage widgets on button press', async () => {
      const someQuery = 'some query';
      const webpageWidgets: WidgetApiWidget<WebpageExposedApi>[] = [{
        id: '1',
        name: 'name',
        api: {
          getUrl: jest.fn(() => 'https://freeter.io/QUERY'),
          openUrl: jest.fn()
        }
      }]
      const getWidgetsInCurrentWorkflow = jest.fn().mockReturnValue(webpageWidgets);
      const { userEvent } = setupSut(
        fixtureSettings1(SettingsMode.Webpages, { engine: '', query: 'query QUERY', url: '' }),
        {
          mockWidgetApi: {
            widgets: {
              getWidgetsInCurrentWorkflow
            }
          }
        }
      );
      const textbox = screen.getByRole('combobox');
      const button = screen.getByRole('button', { name: /query/i });
      await userEvent.type(textbox, someQuery);

      expect(getWidgetsInCurrentWorkflow).not.toHaveBeenCalled();

      await userEvent.click(button);

      expect(getWidgetsInCurrentWorkflow).toHaveBeenCalledTimes(1);
      expect(getWidgetsInCurrentWorkflow).toHaveBeenCalledWith('webpage');
      expect(webpageWidgets[0].api.openUrl).toHaveBeenCalledTimes(1);
      expect(webpageWidgets[0].api.openUrl).toHaveBeenCalledWith('https://freeter.io/query%20some%20query');
    })

    it('should do nothing, if webpage url does not have QUERY', async () => {
      const webpageWidgets: WidgetApiWidget<WebpageExposedApi>[] = [{
        id: '1',
        name: 'name',
        api: {
          getUrl: jest.fn(() => 'https://freeter.io/query'),
          openUrl: jest.fn()
        }
      }]
      const getWidgetsInCurrentWorkflow = jest.fn().mockReturnValue(webpageWidgets);
      const { userEvent } = setupSut(
        fixtureSettings1(SettingsMode.Webpages, { engine: '', query: 'query QUERY', url: '' }),
        {
          mockWidgetApi: {
            widgets: {
              getWidgetsInCurrentWorkflow
            }
          }
        }
      );
      const textbox = screen.getByRole('combobox');

      await userEvent.type(textbox, 'some query' + '[enter]');

      expect(webpageWidgets[0].api.openUrl).not.toHaveBeenCalled();
    })
    it('should correctly do things for multiple widgets', async () => {
      const someQuery = 'some query';
      const webpageWidgets: WidgetApiWidget<WebpageExposedApi>[] = [{
        id: '1',
        name: 'name',
        api: {
          getUrl: jest.fn(() => 'https://freeter.io/QUERY/1'),
          openUrl: jest.fn()
        }
      }, {
        id: '2',
        name: 'name',
        api: {}
      }, {
        id: '3',
        name: 'name',
        api: {
          getUrl: jest.fn(() => 'https://freeter.io/QUERY/2'),
          openUrl: jest.fn()
        }
      }, {
        id: '4',
        name: 'name',
        api: {
          getUrl: jest.fn(() => 'https://freeter.io/query'),
          openUrl: jest.fn()
        }
      }]
      const getWidgetsInCurrentWorkflow = jest.fn().mockReturnValue(webpageWidgets);
      const { userEvent } = setupSut(
        fixtureSettings1(SettingsMode.Webpages, { engine: '', query: 'query QUERY', url: '' }),
        {
          mockWidgetApi: {
            widgets: {
              getWidgetsInCurrentWorkflow
            }
          }
        }
      );
      const textbox = screen.getByRole('combobox');

      await userEvent.type(textbox, someQuery + '[enter]');

      expect(webpageWidgets[0].api.openUrl).toHaveBeenCalledTimes(1);
      expect(webpageWidgets[0].api.openUrl).toHaveBeenCalledWith('https://freeter.io/query%20some%20query/1');
      expect(webpageWidgets[2].api.openUrl).toHaveBeenCalledTimes(1);
      expect(webpageWidgets[2].api.openUrl).toHaveBeenCalledWith('https://freeter.io/query%20some%20query/2');
      expect(webpageWidgets[3].api.openUrl).not.toHaveBeenCalled();
    })
  })

  describe('search history', () => {
    function setupHistory(getJson: jest.Mock, setJson: jest.Mock = jest.fn()) {
      return setupSut(
        fixtureSettings1(SettingsMode.Browser, { engine: defaultEngine.id }),
        { mockWidgetApi: { shell: { openExternalUrl: jest.fn() }, dataStorage: { getJson, setJson } } }
      );
    }

    function historyOptions(): (string | null)[] {
      const list = screen.getByTestId('web-query-history');
      return Array.from(list.querySelectorAll('option')).map(o => o.getAttribute('value'));
    }

    it('saves a submitted query to history', async () => {
      const setJson = jest.fn();
      const { userEvent } = setupHistory(jest.fn().mockResolvedValue([]), setJson);

      await userEvent.type(screen.getByRole('combobox'), 'hello[enter]');

      expect(setJson).toHaveBeenCalledWith('history', ['hello']);
    })

    it('offers the loaded history as input suggestions', async () => {
      setupHistory(jest.fn().mockResolvedValue(['foo', 'bar']));

      await waitFor(() => expect(historyOptions()).toEqual(['foo', 'bar']));
    })

    it('de-duplicates a repeated query and moves it to the front', async () => {
      const setJson = jest.fn();
      const { userEvent } = setupHistory(jest.fn().mockResolvedValue(['a', 'b']), setJson);
      await waitFor(() => expect(historyOptions()).toEqual(['a', 'b']));

      await userEvent.type(screen.getByRole('combobox'), 'b[enter]');

      expect(setJson).toHaveBeenLastCalledWith('history', ['b', 'a']);
    })

    it('offers a "clear recent searches" menu item that empties the history', async () => {
      const setJson = jest.fn();
      const setContextMenuFactory = jest.fn();
      setupSut(
        fixtureSettings1(SettingsMode.Browser, { engine: defaultEngine.id }),
        {
          mockWidgetApi: {
            shell: { openExternalUrl: jest.fn() },
            dataStorage: { getJson: jest.fn().mockResolvedValue(['foo', 'bar']), setJson },
            setContextMenuFactory
          }
        }
      );
      await waitFor(() => expect(historyOptions()).toEqual(['foo', 'bar']));

      const factory = setContextMenuFactory.mock.calls[0][0] as WidgetContextMenuFactory;
      const clearItem = factory('', undefined).find(i => 'label' in i && i.label === labelClearHistory);
      expect(clearItem).toBeDefined();

      await act(async () => { await (clearItem as { doAction: () => Promise<void> }).doAction(); });

      expect(setJson).toHaveBeenLastCalledWith('history', []);
      expect(historyOptions()).toEqual([]);
    })

    it('does not offer the clear item when there is no history', async () => {
      const setContextMenuFactory = jest.fn();
      setupSut(
        fixtureSettings1(SettingsMode.Browser, { engine: defaultEngine.id }),
        {
          mockWidgetApi: {
            shell: { openExternalUrl: jest.fn() },
            dataStorage: { getJson: jest.fn().mockResolvedValue([]) },
            setContextMenuFactory
          }
        }
      );
      await waitFor(() => expect(setContextMenuFactory).toHaveBeenCalled());

      const factory = setContextMenuFactory.mock.calls[0][0] as WidgetContextMenuFactory;
      expect(factory('', undefined)).toEqual([]);
    })
  })

  describe('activity logging', () => {
    it('logs a web_search activity with the typed query on submit', async () => {
      const logActivity = jest.fn();
      const { userEvent } = setupSut(
        fixtureSettings1(SettingsMode.Browser, { engine: defaultEngine.id }),
        { mockWidgetApi: { shell: { openExternalUrl: jest.fn() }, logActivity } }
      );

      await userEvent.type(screen.getByRole('combobox'), 'rust traits[enter]');

      expect(logActivity).toHaveBeenCalledWith('web_search', { text: 'rust traits' });
    })

    it('does not log when the query is empty/whitespace', async () => {
      const logActivity = jest.fn();
      const { userEvent } = setupSut(
        fixtureSettings1(SettingsMode.Browser, { engine: defaultEngine.id }),
        { mockWidgetApi: { shell: { openExternalUrl: jest.fn() }, logActivity } }
      );

      await userEvent.type(screen.getByRole('combobox'), '   [enter]');

      expect(logActivity).not.toHaveBeenCalled();
    })
  })
})
