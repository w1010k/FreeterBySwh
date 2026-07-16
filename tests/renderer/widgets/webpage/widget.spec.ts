/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Settings, SettingsSessionPersist, SettingsSessionScope } from '@/widgets/webpage/settings';
import { widgetComp } from '@/widgets/webpage/widget'
import { act, fireEvent, screen } from '@testing-library/react';
import { SetupWidgetSutOptional, setupWidgetSut } from '@tests/widgets/setupSut'
import { fixtureSettings } from './fixtures';
import { WidgetEnv, EntityId } from '@/widgets/appModules';

function setupWebpageWidgetSut(settings: Settings, optional?: SetupWidgetSutOptional) {
  const { comp, ...rest } = setupWidgetSut(widgetComp, settings, optional);
  const webview = comp.container.getElementsByTagName('webview')[0];
  return {
    comp,
    webview,
    ...rest
  }
}

describe('Webpage Widget', () => {
  it('should render a "not specified" note, if url is empty', () => {
    setupWebpageWidgetSut(fixtureSettings({ url: '' }));

    expect(screen.getByText(/webpage url not specified/i)).toBeInTheDocument();
  })
  it('should not render a "not specified" note, if url is not empty', () => {
    setupWebpageWidgetSut(fixtureSettings({ url: '127.0.0.1' }));

    expect(screen.queryByText(/webpage url not specified/i)).not.toBeInTheDocument();
  })
  it('should render a <webview> element, if url is not empty', () => {
    const { comp } = setupWebpageWidgetSut(fixtureSettings({ url: '127.0.0.1' }));

    expect(comp.container.getElementsByTagName('webview').length).toBe(1);
  })
  it('should not render a <webview> element, if url is empty', () => {
    const { comp } = setupWebpageWidgetSut(fixtureSettings({ url: '' }));

    expect(comp.container.getElementsByTagName('webview').length).toBe(0);
  })
  it('should not re-render <webview> element in DOM, when url changes', () => {
    const { comp, setSettings } = setupWebpageWidgetSut(fixtureSettings({ url: '127.0.0.1' }));
    const elem = comp.container.getElementsByTagName('webview')[0];

    setSettings(fixtureSettings({ url: 'new.url' }));

    expect(comp.container.getElementsByTagName('webview')[0]).toBe(elem);
  })
  it('should not re-render <webview> element in DOM, when sessionScope change does not cause webview partition change', () => {
    const { comp, setSettings } = setupWebpageWidgetSut(fixtureSettings({ sessionScope: 'prj' }), { env: { area: 'shelf' } });
    const elem = comp.container.getElementsByTagName('webview')[0];

    setSettings(fixtureSettings({ sessionScope: 'wfl' }));

    expect(comp.container.getElementsByTagName('webview')[0]).toBe(elem);
  })
  it('should re-render <webview> element in DOM, when sessionScope change causes webview partition change', () => {
    const { comp, setSettings } = setupWebpageWidgetSut(fixtureSettings({ sessionScope: 'wgt' }), { env: { area: 'shelf' } });
    const elem = comp.container.getElementsByTagName('webview')[0];

    setSettings(fixtureSettings({ sessionScope: 'wfl' }));

    expect(comp.container.getElementsByTagName('webview')[0]).not.toBe(elem);
  })
  it('should re-render <webview> element in DOM, when sessionPersist changes', () => {
    const { comp, setSettings } = setupWebpageWidgetSut(fixtureSettings({ sessionPersist: 'persist' }));
    const elem = comp.container.getElementsByTagName('webview')[0];

    setSettings(fixtureSettings({ sessionPersist: 'temp' }));

    expect(comp.container.getElementsByTagName('webview')[0]).not.toBe(elem);
  })
  describe('load failure overlay', () => {
    const failEvent = (props: { isMainFrame: boolean; errorCode: number; validatedURL?: string }) => {
      const evt = new Event('did-fail-load') as Event & typeof props;
      Object.assign(evt, props);
      return evt;
    };

    it('should show an error overlay with the failed URL and a Retry button on a main-frame load failure', () => {
      const { webview } = setupWebpageWidgetSut(fixtureSettings({ url: 'https://nope.invalid/' }));

      act(() => { webview.dispatchEvent(failEvent({ isMainFrame: true, errorCode: -106, validatedURL: 'https://nope.invalid/' })); });

      expect(screen.getByText(/couldn.t be loaded/i)).toBeInTheDocument();
      expect(screen.getByText('https://nope.invalid/')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    })

    it('should ignore sub-frame failures and aborted (-3) loads', () => {
      const { webview } = setupWebpageWidgetSut(fixtureSettings({ url: 'https://x/' }));

      act(() => {
        webview.dispatchEvent(failEvent({ isMainFrame: false, errorCode: -106, validatedURL: 'https://x/iframe' }));
        webview.dispatchEvent(failEvent({ isMainFrame: true, errorCode: -3, validatedURL: 'https://x/' }));
      });

      expect(screen.queryByText(/couldn.t be loaded/i)).not.toBeInTheDocument();
    })

    it('should re-attempt the failed URL via loadURL when Retry is clicked', () => {
      const { webview } = setupWebpageWidgetSut(fixtureSettings({ url: 'https://x/' }));
      const loadURL = jest.fn(() => Promise.resolve());
      (webview as unknown as { loadURL: jest.Mock }).loadURL = loadURL;

      act(() => { webview.dispatchEvent(failEvent({ isMainFrame: true, errorCode: -106, validatedURL: 'https://x/page' })); });
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));

      expect(loadURL).toHaveBeenCalledWith('https://x/page');
    })

    it('should clear the overlay once a new load starts', () => {
      const { webview } = setupWebpageWidgetSut(fixtureSettings({ url: 'https://x/' }));

      act(() => { webview.dispatchEvent(failEvent({ isMainFrame: true, errorCode: -106, validatedURL: 'https://x/' })); });
      expect(screen.getByText(/couldn.t be loaded/i)).toBeInTheDocument();

      act(() => { webview.dispatchEvent(new Event('did-start-loading')); });
      expect(screen.queryByText(/couldn.t be loaded/i)).not.toBeInTheDocument();
    })
  })

  describe('activity logging', () => {
    it('logs a page_visit on navigation, deduped by URL', () => {
      const logActivity = jest.fn();
      const { webview } = setupWebpageWidgetSut(fixtureSettings({ url: 'https://x.com' }), { mockWidgetApi: { logActivity } });
      // Stub the webview's title/URL accessors (not present in jsdom).
      (webview as unknown as { getURL: () => string; getTitle: () => string }).getURL = () => 'https://x.com/page';
      (webview as unknown as { getURL: () => string; getTitle: () => string }).getTitle = () => 'Page Title';

      act(() => { webview.dispatchEvent(new Event('did-navigate')); });
      expect(logActivity).toHaveBeenCalledTimes(1);
      expect(logActivity).toHaveBeenCalledWith('page_visit', { text: 'Page Title', detail: 'https://x.com/page' });

      // Same URL again → no new entry.
      act(() => { webview.dispatchEvent(new Event('did-navigate')); });
      expect(logActivity).toHaveBeenCalledTimes(1);

      // New URL → a new entry.
      (webview as unknown as { getURL: () => string }).getURL = () => 'https://x.com/other';
      act(() => { webview.dispatchEvent(new Event('did-navigate')); });
      expect(logActivity).toHaveBeenCalledTimes(2);
    })
  })

  describe('webview src attribute', () => {
    it('should be as specified by the url setting', () => {
      const testUrl = 'http://127.0.0.1/';
      const { webview } = setupWebpageWidgetSut(fixtureSettings({ url: testUrl }));

      expect(webview).toHaveAttribute('src', testUrl);
    })
    it('should be trimmed', () => {
      const { webview } = setupWebpageWidgetSut(fixtureSettings({ url: '       http://127.0.0.1/      ' }));

      expect(webview).toHaveAttribute('src', 'http://127.0.0.1/');
    })
    it('should be prefixed with the https:// protocol, if url does not have a protocol', () => {
      const { webview } = setupWebpageWidgetSut(fixtureSettings({ url: '127.0.0.1' }));

      expect(webview).toHaveAttribute('src', 'https://127.0.0.1');
    })
    it('should be empty, if url is invalid after prefixing with the https://', () => {
      const { webview } = setupWebpageWidgetSut(fixtureSettings({ url: ':' }));

      expect(webview).not.toHaveAttribute('src');
    })
  })
  describe('webview partition attribute', () => {
    const projectId = 'PROJECT-ID';
    const workflowId = 'WORKFLOW-ID';
    const widgetId = 'WIDGET-ID';
    it.each<[string, SettingsSessionScope, SettingsSessionPersist, EntityId, WidgetEnv]>([
      ['persist:app', 'app', 'persist', widgetId, { area: 'shelf' }],
      ['persist:shlf', 'prj', 'persist', widgetId, { area: 'shelf' }],
      ['persist:shlf', 'wfl', 'persist', widgetId, { area: 'shelf' }],
      [`persist:wgt:${widgetId}`, 'wgt', 'persist', widgetId, { area: 'shelf' }],

      ['persist:app', 'app', 'persist', widgetId, { area: 'workflow', projectId, workflowId }],
      [`persist:prj:${projectId}`, 'prj', 'persist', widgetId, { area: 'workflow', projectId, workflowId }],
      [`persist:wfl:${workflowId}`, 'wfl', 'persist', widgetId, { area: 'workflow', projectId, workflowId }],
      [`persist:wgt:${widgetId}`, 'wgt', 'persist', widgetId, { area: 'workflow', projectId, workflowId }],

      ['app', 'app', 'temp', widgetId, { area: 'shelf' }],
      ['shlf', 'prj', 'temp', widgetId, { area: 'shelf' }],
      ['shlf', 'wfl', 'temp', widgetId, { area: 'shelf' }],
      [`wgt:${widgetId}`, 'wgt', 'temp', widgetId, { area: 'shelf' }],

      ['app', 'app', 'temp', widgetId, { area: 'workflow', projectId, workflowId }],
      [`prj:${projectId}`, 'prj', 'temp', widgetId, { area: 'workflow', projectId, workflowId }],
      [`wfl:${workflowId}`, 'wfl', 'temp', widgetId, { area: 'workflow', projectId, workflowId }],
      [`wgt:${widgetId}`, 'wgt', 'temp', widgetId, { area: 'workflow', projectId, workflowId }],
    ])(
      'should be "%s" when the sessionScope/sessionPersist settings are "%s"/"%s", widgetId is "%s", env is "%o"',
      (expectedPartition, sessionScope, sessionPersist, widgetId, env) => {
        const { webview } = setupWebpageWidgetSut(fixtureSettings({ sessionScope, sessionPersist }), { env, widgetId });
        expect(webview).toHaveAttribute('partition', expectedPartition);
      }
    )
  })

  describe('tabs', () => {
    it('should not render a tab bar when tabs setting is empty', () => {
      setupWebpageWidgetSut(fixtureSettings({ url: 'https://a/', tabs: [] }));

      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    })
    it('should render a tab bar and one webview per url when tabs are set', () => {
      const { comp } = setupWebpageWidgetSut(fixtureSettings({ url: 'https://a/', tabs: ['https://b/', 'https://c/'] }));

      expect(screen.getByRole('tablist')).toBeInTheDocument();
      expect(screen.getAllByRole('tab').length).toBe(3);
      expect(comp.container.getElementsByTagName('webview').length).toBe(3);
    })
    it('should render a webview without a tab bar when url is empty and tabs has a single url', () => {
      const { comp } = setupWebpageWidgetSut(fixtureSettings({ url: '', tabs: ['https://b/'] }));

      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      expect(comp.container.getElementsByTagName('webview')[0]).toHaveAttribute('src', 'https://b/');
    })
    it('should show the first tab initially and switch panes on tab click, keeping inactive webviews mounted', () => {
      const { comp } = setupWebpageWidgetSut(fixtureSettings({ url: 'https://a/', tabs: ['https://b/'] }));
      const tabs = screen.getAllByRole('tab');
      const panes = () => Array.from(comp.container.getElementsByTagName('webview')).map(wv => wv.parentElement as HTMLElement);

      expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
      expect(panes()[0].style.visibility).not.toBe('hidden');
      expect(panes()[0]).not.toHaveAttribute('inert');
      expect(panes()[1].style.visibility).toBe('hidden');
      expect(panes()[1]).toHaveAttribute('inert');

      const secondWebview = comp.container.getElementsByTagName('webview')[1];
      fireEvent.click(tabs[1]);

      expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
      expect(panes()[1].style.visibility).not.toBe('hidden');
      expect(panes()[0].style.visibility).toBe('hidden');
      // the webview element survived the switch (state preserved)
      expect(comp.container.getElementsByTagName('webview')[1]).toBe(secondWebview);
    })
    it('should label tabs with the url hostname until a page title is known', () => {
      setupWebpageWidgetSut(fixtureSettings({ url: 'https://first.host/path', tabs: ['second.host'] }));

      const tabs = screen.getAllByRole('tab');
      expect(tabs[0]).toHaveTextContent('first.host');
      expect(tabs[1]).toHaveTextContent('second.host');
    })
    it('should clamp the active tab when the tab list shrinks', () => {
      const { comp, setSettings } = setupWebpageWidgetSut(fixtureSettings({ url: 'https://a/', tabs: ['https://b/', 'https://c/'] }));
      fireEvent.click(screen.getAllByRole('tab')[2]);

      setSettings(fixtureSettings({ url: 'https://a/', tabs: ['https://b/'] }));

      const tabs = screen.getAllByRole('tab');
      expect(tabs.length).toBe(2);
      expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
      expect(comp.container.getElementsByTagName('webview').length).toBe(2);
    })
  })

  describe('auto-reload', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    function setupAutoReload(seconds: number) {
      const sut = setupWebpageWidgetSut(fixtureSettings({ url: 'https://x/', autoReload: seconds }));
      const reload = jest.fn();
      const wv = sut.webview as unknown as { reload: jest.Mock; isLoading: () => boolean };
      wv.reload = reload;
      wv.isLoading = () => false;
      return { ...sut, reload };
    }

    it('reloads every interval while the webview is not focused', () => {
      const { reload } = setupAutoReload(10);

      act(() => jest.advanceTimersByTime(10000));
      expect(reload).toHaveBeenCalledTimes(1);

      act(() => jest.advanceTimersByTime(10000));
      expect(reload).toHaveBeenCalledTimes(2);
    });

    it('does not reload while the webview is focused', () => {
      const { webview, reload } = setupAutoReload(10);

      act(() => { webview.dispatchEvent(new Event('focus')); });
      act(() => jest.advanceTimersByTime(30000));

      expect(reload).not.toHaveBeenCalled();
    });

    it('cancels a pending reload when the page is focused mid-countdown', () => {
      const { webview, reload } = setupAutoReload(10);

      act(() => jest.advanceTimersByTime(5000)); // halfway through the countdown
      act(() => { webview.dispatchEvent(new Event('focus')); });
      act(() => jest.advanceTimersByTime(10000));

      expect(reload).not.toHaveBeenCalled();
    });

    it('restarts the countdown from zero when focus leaves (blur)', () => {
      const { webview, reload } = setupAutoReload(10);

      act(() => { webview.dispatchEvent(new Event('focus')); });
      act(() => jest.advanceTimersByTime(30000));
      expect(reload).not.toHaveBeenCalled();

      act(() => { webview.dispatchEvent(new Event('blur')); });
      act(() => jest.advanceTimersByTime(9000));
      expect(reload).not.toHaveBeenCalled(); // 10s not elapsed yet
      act(() => jest.advanceTimersByTime(1000));
      expect(reload).toHaveBeenCalledTimes(1);
    });
  })
})
