/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ContextMenuEvent, ReactComponent, WidgetReactComponentProps } from '@/widgets/appModules';
import { Settings } from './settings';
import * as styles from './widget.module.scss';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// import { DidFailLoadEvent } from 'electron';
import { createActionBarItems } from '@/widgets/webpage/actionBar';
import { sanitizeUrl } from '@common/helpers/sanitizeUrl';
import { createContextMenuFactory } from '@/widgets/webpage/contextMenu';
import { ContextMenuEvent as ElectronContextMenuEvent } from 'electron';
import { createPartition } from '@/widgets/webpage/partition';
import { reload, zoomReset, zoomStepIn, zoomStepOut } from '@/widgets/webpage/actions';
import { WebpageExposedApi } from '@/widgets/interfaces';
import { WEBPAGE_ZOOM_EVENT, WebpageZoomEventDetail } from '@/widgets/webpage/zoomEvents';

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

interface WebviewProps extends WidgetReactComponentProps<Settings> {
  /**
   * Should be called when <Webview> tag requires a full restart by
   * replacing it in DOM
   */
  onRequireRestart: () => void;
}

function Webview({settings, widgetApi, onRequireRestart, env, id}: WebviewProps) {
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
  const [isLoading, setIsLoading] = useState(false);
  const [webviewIsReady, setWebviewIsReady] = useState(false);
  const [autoReloadStopped, setAutoReloadStopped] = useState(false);
  const [cssInDom, setCssInDom] = useState<[string, string]|null>(null);

  const sanitUrl = useMemo(() => sanitizeUrl(url), [url]);
  const sanitUA = useMemo(() => userAgent.trim(), [userAgent]);

  useEffect(() => {
    exposeApi<WebpageExposedApi>({
      openUrl: (url: string) => webviewRef.current?.loadURL(url),
      getUrl: () => url,
    })
  }, [exposeApi, url])

  const refreshActions = useCallback(
    () => updateActionBar(
      createActionBarItems(
        webviewIsReady ? webviewRef.current : null,
        widgetApi,
        url,
        autoReload,
        autoReloadStopped,
        setAutoReloadStopped
      )
    ),
    [autoReload, autoReloadStopped, updateActionBar, url, webviewIsReady, widgetApi]
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
      setDynamicTitle(parts.length > 0 ? parts.join(' — ') : null);
    }
    const handlePageTitleUpdated = () => publishTitle();
    const handleDidNavigateForTitle = () => publishTitle();
    // const handleDidFailLoad = (e: DidFailLoadEvent) => {
    //   console.log(e.errorDescription);
    // };

    // Add event listeners
    webviewEl.addEventListener('did-start-loading', handleDidStartLoading);
    webviewEl.addEventListener('did-stop-loading', handleDidStopLoading);
    // webviewEl.addEventListener('did-fail-load', handleDidFailLoad);
    webviewEl.addEventListener('context-menu', handleContextMenu)
    webviewEl.addEventListener('page-title-updated', handlePageTitleUpdated);
    webviewEl.addEventListener('did-navigate', handleDidNavigateForTitle);
    webviewEl.addEventListener('did-navigate-in-page', handleDidNavigateForTitle);

    return () => {
      // Remove event listeners
      webviewEl.removeEventListener('did-start-loading', handleDidStartLoading);
      webviewEl.removeEventListener('did-stop-loading', handleDidStopLoading);
      // webviewEl.removeEventListener('did-fail-load', handleDidFailLoad);
      webviewEl.removeEventListener('context-menu', handleContextMenu)
      webviewEl.removeEventListener('page-title-updated', handlePageTitleUpdated);
      webviewEl.removeEventListener('did-navigate', handleDidNavigateForTitle);
      webviewEl.removeEventListener('did-navigate-in-page', handleDidNavigateForTitle);
      // Clear the override so a fresh mount (e.g. after a required restart)
      // doesn't briefly show a stale title.
      setDynamicTitle(null);
    };
  }, [setDynamicTitle]);

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
  }, [injectCSSInDOM, injectedCSS, injectedJS, refreshActions]);

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

  useEffect(() => {
    if (autoReload>0 && !autoReloadStopped) {
      const interval = setInterval(() => webviewRef.current && reload(webviewRef.current), autoReload*1000)

      return () => clearInterval(interval)
    }
    return undefined;
  }, [autoReload, autoReloadStopped])

  return <>
    <webview
      ref={webviewRef}
      // eslint-disable-next-line react/no-unknown-property
      allowpopups={'' as unknown as boolean}
      // eslint-disable-next-line react/no-unknown-property
      partition={initPartition.current}
      className={styles['webview']}
      tabIndex={0} // this enables the tab-navigation to widget action bar
      src={sanitUrl !== '' ? sanitUrl : undefined}
      // eslint-disable-next-line react/no-unknown-property
      useragent={sanitUA !== '' ? sanitUA : undefined}
    ></webview>
    {isLoading && <div className={styles['loading']}>Loading...</div>}
  </>
}

export function WidgetComp(props: WidgetReactComponentProps<Settings>) {
  const {url} = props.settings;
  const [requireRestart, setRequireRestart] = useState(1);

  const doRestart = useCallback(() => setRequireRestart(requireRestart+1), [requireRestart])

  useEffect(()=> {
    if(!url) {
      const {updateActionBar, setContextMenuFactory, setDynamicTitle} = props.widgetApi;
      setContextMenuFactory(createContextMenuFactory(null, props.widgetApi, url, 0, false, () => undefined));
      updateActionBar(createActionBarItems(null, props.widgetApi, url, 0, false, () => undefined));
      setDynamicTitle(null);
    }
  }, [props.widgetApi, url]);

  return url ? (
    <Webview key={requireRestart} onRequireRestart={doRestart} {...props}></Webview>
  ) : (
    <div className={styles['not-configured']}>
      Webpage URL not specified.
    </div>
  )
}

export const widgetComp: ReactComponent<WidgetReactComponentProps<Settings>> = {
  type: 'react',
  Comp: WidgetComp
}
