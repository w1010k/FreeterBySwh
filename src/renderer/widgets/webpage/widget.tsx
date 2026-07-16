/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ContextMenuEvent, ReactComponent, WidgetReactComponentProps } from '@/widgets/appModules';
import { Settings } from './settings';
import styles from './widget.module.scss';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// import { DidFailLoadEvent } from 'electron';
import { createActionBarItems } from '@/widgets/webpage/actionBar';
import { sanitizeUrl } from '@common/helpers/sanitizeUrl';
import { createContextMenuFactory } from '@/widgets/webpage/contextMenu';
import { ContextMenuEvent as ElectronContextMenuEvent } from 'electron';
import { createPartition } from '@/widgets/webpage/partition';
import { canGoHome, goHome, reload, setAudioMuted, zoomReset, zoomStepIn, zoomStepOut } from '@/widgets/webpage/actions';
import { WebpageExposedApi } from '@/widgets/interfaces';
import { WEBPAGE_ZOOM_EVENT, WebpageZoomEventDetail } from '@/widgets/webpage/zoomEvents';
import { WEBPAGE_GO_HOME_EVENT, WebpageGoHomeEventDetail } from '@/widgets/webpage/homeEvents';

// Injected into each webview on dom-ready. Intercepts Ctrl/Cmd + wheel before
// the guest page sees it (`capture: true, passive: false` — passive must be
// false so preventDefault() actually works), then signals the host via a
// magic-prefixed console.log that the host listens for through the webview
// tag's `console-message` event. This round-trip is needed because the guest
// runs in a separate process and has no default IPC channel back to the host;
// using `console-message` avoids adding a webview preload bundle just for this.
const ZOOM_WHEEL_MARKER = '__FREETER_WEBPAGE_ZOOM_WHEEL__';
const zoomWheelInjectionJs = `
(function() {
  if (window.__freeterWebpageZoomHooked) { return; }
  window.__freeterWebpageZoomHooked = true;
  window.addEventListener('wheel', function(e) {
    if (!e.ctrlKey && !e.metaKey) { return; }
    e.preventDefault();
    console.log('${ZOOM_WHEEL_MARKER}', e.deltaY);
  }, { passive: false, capture: true });
})();
`;

// Same console.log signalling trick as zoom-wheel: intercept Ctrl/Cmd+F inside
// the guest (where the host window can't see the keystroke) and tell the host to
// open the in-page find bar. Capture phase + preventDefault so the guest page's
// own find handling (if any) doesn't also fire.
const FIND_KEY_MARKER = '__FREETER_WEBPAGE_FIND_KEY__';
const findKeyInjectionJs = `
(function() {
  if (window.__freeterWebpageFindHooked) { return; }
  window.__freeterWebpageFindHooked = true;
  window.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      console.log('${FIND_KEY_MARKER}');
    }
  }, { capture: true });
})();
`;

interface WebviewProps extends WidgetReactComponentProps<Settings> {
  /**
   * Should be called when <Webview> tag requires a full restart by
   * replacing it in DOM
   */
  onRequireRestart: () => void;
  /**
   * Multi-tab mode: reports the page title so the parent can label the tab
   * and own the widget's dynamic title (setDynamicTitle is no-op'ed per tab
   * to avoid cross-tab overwrite races).
   */
  onTitleInfo?: (info: {pageTitle: string; dynamicTitle: string | null}) => void;
}

function Webview({settings, widgetApi, onRequireRestart, onTitleInfo, env, id}: WebviewProps) {
  const {url, sessionScope, sessionPersist, autoReload, injectedCSS, injectedJS, userAgent} = settings;

  const partition = useMemo(() => createPartition(sessionPersist, sessionScope, env, id), [
    env, id, sessionScope, sessionPersist
  ])

  const initPartition = useRef(partition)

  const reqRestartIfChanged = useMemo(() => ([injectedJS, userAgent]), [injectedJS, userAgent])

  const initReqRestartIfChanged = useRef(reqRestartIfChanged)

  useEffect(() => {
    if(partition !== initPartition.current || reqRestartIfChanged !== initReqRestartIfChanged.current) {
      onRequireRestart();
    }
  }, [onRequireRestart, partition, reqRestartIfChanged])

  const {updateActionBar, setContextMenuFactory, exposeApi, setDynamicTitle} = widgetApi;
  const webviewRef = useRef<Electron.WebviewTag>(null);
  // Last URL logged to the activity timeline, to dedupe repeated title/navigate events.
  const lastLoggedUrlRef = useRef<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [webviewIsReady, setWebviewIsReady] = useState(false);
  const [autoReloadStopped, setAutoReloadStopped] = useState(false);
  const [cssInDom, setCssInDom] = useState<[string, string]|null>(null);
  const [audioMuted, setAudioMutedState] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findResult, setFindResult] = useState<{ active: number; total: number }>({ active: 0, total: 0 });
  const findInputRef = useRef<HTMLInputElement>(null);

  const sanitUrl = useMemo(() => sanitizeUrl(url), [url]);
  const sanitUA = useMemo(() => userAgent.trim(), [userAgent]);

  useEffect(() => {
    exposeApi<WebpageExposedApi>({
      openUrl: (url: string) => webviewRef.current?.loadURL(url),
      getUrl: () => url,
    })
  }, [exposeApi, url])

  // Apply the mute state to the guest. setAudioMuted persists across in-page
  // navigations/reloads on the same webContents, so we only need to (re)apply
  // when the flag changes or the webview first becomes ready.
  const toggleMute = useCallback(() => setAudioMutedState(muted => !muted), []);
  useEffect(() => {
    if (webviewIsReady) {
      const webviewEl = webviewRef.current;
      if (webviewEl) {
        setAudioMuted(webviewEl, audioMuted);
      }
    }
  }, [audioMuted, webviewIsReady])

  // In-page find (Ctrl/Cmd+F or action-bar button). The find bar lives in the
  // host; results come back via the webview's 'found-in-page' event (wired below).
  const openFind = useCallback(() => setFindOpen(true), []);
  const closeFind = useCallback(() => {
    setFindOpen(false);
    setFindQuery('');
    setFindResult({ active: 0, total: 0 });
    webviewRef.current?.focus();
  }, []);
  const findNext = useCallback((forward: boolean) => {
    const webviewEl = webviewRef.current;
    if (webviewEl && findQuery !== '') {
      webviewEl.findInPage(findQuery, { findNext: true, forward });
    }
  }, [findQuery]);
  // Incremental search: re-query as the text changes; clear highlights when the
  // query empties or the bar closes.
  useEffect(() => {
    if (!webviewIsReady) {
      return;
    }
    const webviewEl = webviewRef.current;
    if (!webviewEl) {
      return;
    }
    if (findOpen && findQuery !== '') {
      webviewEl.findInPage(findQuery);
    } else {
      // Clear highlights when the query empties or the bar closes. The match
      // count display is gated on `findQuery !== ''`, so stale counts aren't
      // shown; found-in-page refreshes them as soon as a new query runs.
      webviewEl.stopFindInPage('clearSelection');
    }
  }, [findOpen, findQuery, webviewIsReady])
  // Focus the find input when the bar opens.
  useEffect(() => {
    if (findOpen) {
      findInputRef.current?.focus();
    }
  }, [findOpen])

  const refreshActions = useCallback(
    () => updateActionBar(
      createActionBarItems(
        webviewIsReady ? webviewRef.current : null,
        widgetApi,
        url,
        autoReload,
        autoReloadStopped,
        setAutoReloadStopped,
        audioMuted,
        toggleMute,
        openFind
      )
    ),
    [autoReload, autoReloadStopped, updateActionBar, url, webviewIsReady, widgetApi, audioMuted, toggleMute, openFind]
  );

  const injectCSSInDOM = useCallback(
    async (css: string, force: boolean) => {
      if(webviewIsReady) {
        // reinject not forced, css not changed
        if (!force && cssInDom && cssInDom[1] === css) {
          return;
        }
        const webviewEl = webviewRef.current;
        if (!webviewEl) {
          return;
        }
        const removeCss = cssInDom && cssInDom[0];
        if(css.trim()!=='') {
          const k = await webviewEl.insertCSS(css);
          setCssInDom([k, css]);
        } else {
          setCssInDom(null);
        }
        if(removeCss) {
          webviewEl.removeInsertedCSS(removeCss);
        }
      }
    },
    [cssInDom, webviewIsReady]
  )

  useEffect(() => {
    setContextMenuFactory(
      createContextMenuFactory(
        webviewIsReady ? webviewRef.current : null,
        widgetApi,
        url,
        autoReload,
        autoReloadStopped,
        setAutoReloadStopped
      )
    )

    return undefined;
  }, [setContextMenuFactory, webviewIsReady, widgetApi, url, autoReload, autoReloadStopped])

  useEffect(() => {
    const webviewEl = webviewRef.current;

    if (!webviewEl) {
      return undefined;
    }

    const handleDidStartLoading = () => {
      setIsLoading(true);
      // A fresh load attempt clears any previous failure overlay.
      setLoadError(null);
    }
    const handleDidStopLoading = () => {
      setIsLoading(false);
    }

    // Electron creates a 'context-menu' event for Webview element. We should turn it
    // into a HTML-standard 'contextmenu' event to enable context menus. We also
    // transfer ElectronContextMenuEvent.params as contextData to make it accessible
    // in contextMenuFactory.
    const handleContextMenu = (e: ElectronContextMenuEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const evt = new MouseEvent('contextmenu', {bubbles: true}) as ContextMenuEvent;
      evt.contextData = e.params;
      webviewEl.dispatchEvent(evt);
    }
    // Keep the widget header in sync with the current page so the webpage
    // widget can show something meaningful even when the user hasn't named it
    // explicitly. `coreSettings.name` still wins when set. Both the title and
    // the URL are surfaced because users often want to see the address itself.
    const publishTitle = () => {
      const curUrl = webviewEl.getURL ? webviewEl.getURL() : '';
      const curTitle = webviewEl.getTitle ? webviewEl.getTitle() : '';
      const parts = [curTitle, curUrl].filter(s => s && s.trim() !== '');
      const dynTitle = parts.length > 0 ? parts.join(' — ') : null;
      setDynamicTitle(dynTitle);
      onTitleInfo?.({pageTitle: curTitle, dynamicTitle: dynTitle});
      // Record a page_visit once per distinct URL for the activity timeline.
      if (curUrl && curUrl !== lastLoggedUrlRef.current) {
        lastLoggedUrlRef.current = curUrl;
        widgetApi.logActivity('page_visit', { text: curTitle || curUrl, detail: curUrl });
      }
    }
    const handlePageTitleUpdated = () => publishTitle();
    const handleDidNavigateForTitle = () => publishTitle();
    const handleFoundInPage = (e: Electron.FoundInPageEvent) => {
      setFindResult({ active: e.result.activeMatchOrdinal, total: e.result.matches });
    };
    // Surface main-frame load failures as an overlay instead of a silent blank
    // page. Ignore sub-frame failures (a broken iframe shouldn't blank the whole
    // widget) and code -3 (ERR_ABORTED — e.g. the user navigated away or hit
    // stop, which isn't a real error).
    const handleDidFailLoad = (e: Electron.DidFailLoadEvent) => {
      if (e.isMainFrame && e.errorCode !== -3) {
        setLoadError(e.validatedURL || '');
      }
    };

    // Add event listeners
    webviewEl.addEventListener('did-start-loading', handleDidStartLoading);
    webviewEl.addEventListener('did-stop-loading', handleDidStopLoading);
    webviewEl.addEventListener('did-fail-load', handleDidFailLoad);
    webviewEl.addEventListener('context-menu', handleContextMenu)
    webviewEl.addEventListener('page-title-updated', handlePageTitleUpdated);
    webviewEl.addEventListener('did-navigate', handleDidNavigateForTitle);
    webviewEl.addEventListener('did-navigate-in-page', handleDidNavigateForTitle);
    webviewEl.addEventListener('found-in-page', handleFoundInPage);

    return () => {
      // Remove event listeners
      webviewEl.removeEventListener('did-start-loading', handleDidStartLoading);
      webviewEl.removeEventListener('did-stop-loading', handleDidStopLoading);
      webviewEl.removeEventListener('did-fail-load', handleDidFailLoad);
      webviewEl.removeEventListener('context-menu', handleContextMenu)
      webviewEl.removeEventListener('page-title-updated', handlePageTitleUpdated);
      webviewEl.removeEventListener('did-navigate', handleDidNavigateForTitle);
      webviewEl.removeEventListener('did-navigate-in-page', handleDidNavigateForTitle);
      webviewEl.removeEventListener('found-in-page', handleFoundInPage);
      // Clear the override so a fresh mount (e.g. after a required restart)
      // doesn't briefly show a stale title.
      setDynamicTitle(null);
    };
  }, [setDynamicTitle, onTitleInfo]);

  useEffect(() => {
    injectCSSInDOM(injectedCSS, false);
  }, [injectedCSS, injectCSSInDOM]);

  useEffect(() => {
    refreshActions();

    const webviewEl = webviewRef.current;

    if (!webviewEl) {
      return undefined;
    }

    const handleDomReady = () => {
      setWebviewIsReady(true);
      refreshActions();
      injectCSSInDOM(injectedCSS, true);
      if (injectedJS) {
        webviewEl.executeJavaScript(injectedJS);
      }
      // Intercept Ctrl+wheel to zoom the page; see `zoomWheelInjectionJs`
      // for the rationale on using console.log as the signalling channel.
      webviewEl.executeJavaScript(zoomWheelInjectionJs).catch(() => undefined);
      // Intercept Ctrl/Cmd+F to open the in-page find bar (same signalling trick).
      webviewEl.executeJavaScript(findKeyInjectionJs).catch(() => undefined);
      // webviewEl.classList.add('is-bg-visible');
    }
    const handleDidFinishLoad = () => {
      refreshActions();
    }
    const handleDidNavigate = () => {
      refreshActions();
    }
    const handleDidFrameNavigate = () => {
      refreshActions();
    }
    const handleDidNavigateInPage = () => {
      refreshActions();
    }
    const handleConsoleMessage = (e: Electron.ConsoleMessageEvent) => {
      if (e.message && e.message.startsWith(FIND_KEY_MARKER)) {
        openFind();
        return;
      }
      if (!e.message || !e.message.startsWith(ZOOM_WHEEL_MARKER)) {
        return;
      }
      const rest = e.message.slice(ZOOM_WHEEL_MARKER.length).trim();
      const deltaY = Number(rest);
      if (!Number.isFinite(deltaY) || deltaY === 0) {
        return;
      }
      if (deltaY < 0) {
        zoomStepIn(webviewEl);
      } else {
        zoomStepOut(webviewEl);
      }
    }

    // Add event listeners
    webviewEl.addEventListener('dom-ready', handleDomReady);
    webviewEl.addEventListener('did-navigate', handleDidNavigate);
    webviewEl.addEventListener('did-frame-navigate', handleDidFrameNavigate);
    webviewEl.addEventListener('did-navigate-in-page', handleDidNavigateInPage);
    webviewEl.addEventListener('did-finish-load', handleDidFinishLoad);
    webviewEl.addEventListener('console-message', handleConsoleMessage);

    return () => {
      // Remove event listeners
      webviewEl.removeEventListener('dom-ready', handleDomReady);
      webviewEl.removeEventListener('did-navigate', handleDidNavigate);
      webviewEl.removeEventListener('did-frame-navigate', handleDidFrameNavigate);
      webviewEl.removeEventListener('did-navigate-in-page', handleDidNavigateInPage);
      webviewEl.removeEventListener('did-finish-load', handleDidFinishLoad);
      webviewEl.removeEventListener('console-message', handleConsoleMessage);
          };
  }, [injectCSSInDOM, injectedCSS, injectedJS, refreshActions, openFind]);

  // Keyboard zoom (CmdOrCtrl + = / - / 0) is routed from the main process
  // through `init.ts` as a window CustomEvent; we match our own
  // webContentsId to only react when the active webview is ours.
  useEffect(() => {
    if (!webviewIsReady) {
      return undefined;
    }
    const webviewEl = webviewRef.current;
    if (!webviewEl) {
      return undefined;
    }
    let myId: number | null = null;
    try {
      myId = webviewEl.getWebContentsId();
    } catch {
      return undefined;
    }
    const onZoom = (e: Event) => {
      const detail = (e as CustomEvent<WebpageZoomEventDetail>).detail;
      if (!detail || detail.webContentsId !== myId) {
        return;
      }
      if (detail.direction === 'in') {
        zoomStepIn(webviewEl);
      } else if (detail.direction === 'out') {
        zoomStepOut(webviewEl);
      } else {
        zoomReset(webviewEl);
      }
    };
    window.addEventListener(WEBPAGE_ZOOM_EVENT, onZoom);
    return () => window.removeEventListener(WEBPAGE_ZOOM_EVENT, onZoom);
  }, [webviewIsReady]);

  // Alt+Home routed from main → init.ts; match the action bar's "Go to start
  // page" by skipping when we're already on the home URL (canGoHome guards
  // unnecessary reloads), mirroring the disabled-button behavior.
  useEffect(() => {
    if (!webviewIsReady) {
      return undefined;
    }
    const webviewEl = webviewRef.current;
    if (!webviewEl) {
      return undefined;
    }
    let myId: number | null = null;
    try {
      myId = webviewEl.getWebContentsId();
    } catch {
      return undefined;
    }
    const onGoHome = (e: Event) => {
      const detail = (e as CustomEvent<WebpageGoHomeEventDetail>).detail;
      if (!detail || detail.webContentsId !== myId) {
        return;
      }
      if (canGoHome(webviewEl, url)) {
        goHome(webviewEl, url);
      }
    };
    window.addEventListener(WEBPAGE_GO_HOME_EVENT, onGoHome);
    return () => window.removeEventListener(WEBPAGE_GO_HOME_EVENT, onGoHome);
  }, [webviewIsReady, url]);

  // Auto-reload counts down ONLY while the webview is NOT focused, so a scheduled
  // reload never wipes out what the user is actively doing on the page (typing in
  // a form, etc.). Focusing the page clears the timer; blurring (re)starts a fresh
  // interval — so the countdown begins from the moment focus leaves, and while it
  // stays unfocused the page keeps reloading every `autoReload` seconds.
  useEffect(() => {
    const webviewEl = webviewRef.current;
    if (!webviewEl || autoReload <= 0 || autoReloadStopped) {
      return undefined;
    }

    let interval: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      if (interval !== undefined) {
        clearInterval(interval);
        interval = undefined;
      }
    };
    const start = () => {
      stop();
      interval = setInterval(() => {
        if (webviewRef.current) {
          reload(webviewRef.current);
        }
      }, autoReload * 1000);
    };

    const onFocus = () => stop(); // user entered the page → pause + reset the countdown
    const onBlur = () => start(); // focus left → start counting from zero
    webviewEl.addEventListener('focus', onFocus);
    webviewEl.addEventListener('blur', onBlur);

    // Begin immediately unless the page already has focus.
    if (document.activeElement !== webviewEl) {
      start();
    }

    return () => {
      stop();
      webviewEl.removeEventListener('focus', onFocus);
      webviewEl.removeEventListener('blur', onBlur);
    };
  }, [autoReload, autoReloadStopped])

  return <>
    <webview
      ref={webviewRef}
      // eslint-disable-next-line react/no-unknown-property
      allowpopups={'' as unknown as boolean}
      // eslint-disable-next-line react/no-unknown-property
      partition={partition}
      className={styles['webview']}
      tabIndex={0} // this enables the tab-navigation to widget action bar
      src={sanitUrl !== '' ? sanitUrl : undefined}
      // eslint-disable-next-line react/no-unknown-property
      useragent={sanitUA !== '' ? sanitUA : undefined}
    ></webview>
    {findOpen && <div className={styles['find-bar']}>
      <input
        ref={findInputRef}
        type="text"
        className={styles['find-input']}
        value={findQuery}
        placeholder="Find in page"
        onChange={e => setFindQuery(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            findNext(!e.shiftKey);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            closeFind();
          }
        }}
      />
      <span className={styles['find-count']}>{findQuery !== '' ? `${findResult.active}/${findResult.total}` : ''}</span>
      <button className={styles['find-btn']} title="Previous (Shift+Enter)" onClick={() => findNext(false)}>↑</button>
      <button className={styles['find-btn']} title="Next (Enter)" onClick={() => findNext(true)}>↓</button>
      <button className={styles['find-btn']} title="Close (Esc)" onClick={closeFind}>✕</button>
    </div>}
    {loadError !== null && <div className={styles['load-error']}>
      <div className={styles['load-error-title']}>This page couldn{'’'}t be loaded</div>
      {loadError !== '' && <div className={styles['load-error-url']}>{loadError}</div>}
      <button className={styles['load-error-retry']} onClick={() => {
        const el = webviewRef.current;
        if (!el) {
          return;
        }
        // Re-attempt the URL that failed (falling back to the configured one).
        // reload() alone isn't reliable here: when the *initial* load failed
        // nothing is committed, so there's no current page to reload.
        const target = loadError || sanitUrl;
        if (target) {
          el.loadURL(target).catch(() => undefined);
        } else {
          reload(el);
        }
      }}>Retry</button>
    </div>}
    {isLoading && <div className={styles['loading']}>Loading...</div>}
  </>
}

const noopApiFn = () => undefined;

interface TabTitleInfo { pageTitle: string; dynamicTitle: string | null }

function tabLabel(url: string, info: TabTitleInfo | undefined): string {
  if (info?.pageTitle && info.pageTitle.trim() !== '') {
    return info.pageTitle;
  }
  try {
    return new URL(sanitizeUrl(url)).hostname || url;
  } catch {
    return url;
  }
}

export function WidgetComp(props: WidgetReactComponentProps<Settings>) {
  const {settings, widgetApi} = props;
  const urls = useMemo(
    () => [settings.url, ...settings.tabs].map(u => u.trim()).filter(u => u !== ''),
    [settings.url, settings.tabs]
  );
  const multiTab = urls.length > 1;
  const [requireRestart, setRequireRestart] = useState(1);
  const doRestart = useCallback(() => setRequireRestart(n => n + 1), [])
  const [activeTab, setActiveTab] = useState(0);
  // Clamp instead of resetting state so removing a middle tab keeps a sane selection.
  const active = Math.min(activeTab, Math.max(urls.length - 1, 0));
  const [tabTitles, setTabTitles] = useState<Record<number, TabTitleInfo>>({});

  // Multi-tab mode mounts one <Webview> per tab (inactive ones stay alive,
  // hidden via visibility). Only the active tab may own the widget-level API
  // surfaces (action bar, context menu, exposed api) — the rest get no-ops so
  // they can't overwrite it. The dynamic title is owned by the parent for ALL
  // tabs, because effect cleanup order between two tabs would otherwise let a
  // deactivating tab null out the title the newly active tab just published.
  const activeApi = useMemo(() => ({...widgetApi, setDynamicTitle: noopApiFn}), [widgetApi]);
  const inactiveApi = useMemo(() => ({
    ...widgetApi,
    setDynamicTitle: noopApiFn,
    updateActionBar: noopApiFn,
    setContextMenuFactory: noopApiFn,
    exposeApi: noopApiFn
  }), [widgetApi]);
  const titleHandlers = useMemo(
    () => urls.map((_, i) => (info: TabTitleInfo) => setTabTitles(prev => ({...prev, [i]: info}))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [urls.length]
  );

  const {setDynamicTitle} = widgetApi;
  useEffect(() => {
    if (multiTab) {
      setDynamicTitle(tabTitles[active]?.dynamicTitle ?? null);
    }
  }, [multiTab, setDynamicTitle, tabTitles, active]);

  useEffect(()=> {
    if(urls.length === 0) {
      const {updateActionBar, setContextMenuFactory, setDynamicTitle} = widgetApi;
      setContextMenuFactory(createContextMenuFactory(null, widgetApi, '', 0, false, () => undefined));
      updateActionBar(createActionBarItems(null, widgetApi, '', 0, false, () => undefined));
      setDynamicTitle(null);
    }
  }, [widgetApi, urls.length]);

  if (urls.length === 0) {
    return <div className={styles['not-configured']}>
      Webpage URL not specified.
    </div>
  }

  if (!multiTab) {
    return <Webview key={requireRestart} onRequireRestart={doRestart} {...props} settings={{...settings, url: urls[0]}}></Webview>
  }

  return <div className={styles['tabs']}>
    <div className={styles['tabs-bar']} role="tablist">
      {urls.map((u, i) => (
        <button
          key={i}
          role="tab"
          aria-selected={i === active}
          title={u}
          className={i === active ? `${styles['tab']} ${styles['tab-active']}` : styles['tab']}
          onClick={() => setActiveTab(i)}
        >{tabLabel(u, tabTitles[i])}</button>
      ))}
    </div>
    <div className={styles['tabs-panes']}>
      {urls.map((u, i) => (
        // visibility (not display:none) keeps hidden webviews alive so tab
        // state (scroll, forms, logins) survives switching.
        <div
          key={`${requireRestart}:${i}:${u}`}
          className={styles['tab-pane']}
          style={i === active ? undefined : {visibility: 'hidden'}}
          aria-hidden={i !== active}
          // same hiding contract as inactive workflows in widgetLayout.tsx:
          // visibility keeps the webview alive, inert blocks focus/interaction
          {...{ inert: i !== active ? true : undefined }}
        >
          <Webview
            {...props}
            settings={{...settings, url: u}}
            widgetApi={i === active ? activeApi : inactiveApi}
            onRequireRestart={doRestart}
            onTitleInfo={titleHandlers[i]}
          ></Webview>
        </div>
      ))}
    </div>
  </div>
}

export const widgetComp: ReactComponent<WidgetReactComponentProps<Settings>> = {
  type: 'react',
  Comp: WidgetComp
}
