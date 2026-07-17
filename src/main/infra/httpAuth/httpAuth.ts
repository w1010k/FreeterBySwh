/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { app as electronApp, AuthInfo, BrowserWindow, WebContents } from 'electron';

export interface HttpAuthCredentials {
  username: string;
  password: string;
}

// The prompt page reports its result through a marker-prefixed console.log
// (same signalling trick the webpage widget uses for zoom/find): the window
// has no preload bundle, so console-message is the cheapest host channel.
const RESULT_MARKER = '__FREETER_HTTP_AUTH_RESULT__';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildAuthPromptHtml(authInfo: Pick<AuthInfo, 'host' | 'port' | 'isProxy' | 'realm'>): string {
  const source = escapeHtml(`${authInfo.host}:${authInfo.port}`);
  const kind = authInfo.isProxy ? 'proxy' : 'server';
  const realm = authInfo.realm ? `<div class="realm">Realm: ${escapeHtml(authInfo.realm)}</div>` : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sign in</title><style>
    body { font-family: system-ui, sans-serif; font-size: 13px; margin: 16px; }
    .realm { color: #666; margin-top: 4px; }
    label { display: block; margin-top: 10px; }
    input { width: 100%; box-sizing: border-box; margin-top: 2px; padding: 4px; }
    .buttons { margin-top: 16px; text-align: right; }
    button { padding: 4px 14px; margin-left: 8px; }
  </style></head><body>
    <div>The ${kind} <b>${source}</b> requires a username and password.</div>
    ${realm}
    <form id="f">
      <label>Username <input id="u" type="text" autofocus></label>
      <label>Password <input id="p" type="password"></label>
      <div class="buttons">
        <button type="button" id="cancel">Cancel</button>
        <button type="submit">Sign in</button>
      </div>
    </form>
    <script>
      var send = function(result) { console.log('${RESULT_MARKER}' + JSON.stringify(result)); };
      document.getElementById('f').addEventListener('submit', function(e) {
        e.preventDefault();
        send({ username: document.getElementById('u').value, password: document.getElementById('p').value });
      });
      document.getElementById('cancel').addEventListener('click', function() { send(null); });
      window.addEventListener('keydown', function(e) { if (e.key === 'Escape') { send(null); } });
    </script>
  </body></html>`;
}

function promptForCredentials(wc: WebContents, authInfo: AuthInfo): Promise<HttpAuthCredentials | null> {
  return new Promise((resolve) => {
    // For a <webview> guest the owning BrowserWindow is the host's window.
    const parent = BrowserWindow.fromWebContents(wc.hostWebContents ?? wc) ?? undefined;
    const win = new BrowserWindow({
      width: 400,
      height: 260,
      parent,
      modal: parent !== undefined,
      resizable: false,
      minimizable: false,
      maximizable: false,
      title: 'Sign in',
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
    });
    win.removeMenu();

    let resolved = false;
    const finish = (result: HttpAuthCredentials | null) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
      if (!win.isDestroyed()) {
        win.close();
      }
    };

    win.webContents.on('console-message', (_e, _level, message) => {
      if (typeof message !== 'string' || !message.startsWith(RESULT_MARKER)) {
        return;
      }
      try {
        const parsed = JSON.parse(message.slice(RESULT_MARKER.length));
        finish(
          parsed && typeof parsed.username === 'string' && typeof parsed.password === 'string'
            ? { username: parsed.username, password: parsed.password }
            : null
        );
      } catch {
        finish(null);
      }
    });
    // Closing the window (X button) counts as cancel.
    win.on('closed', () => finish(null));

    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(buildAuthPromptHtml(authInfo)));
  });
}

type LoginEvent = { preventDefault: () => void };
type LoginCallback = (username?: string, password?: string) => void;

/**
 * Factored out of registerHttpAuthHandler so the decision logic is testable
 * with an injected prompt (the real one opens a BrowserWindow).
 */
export function createLoginHandler(
  prompt: (wc: WebContents, authInfo: AuthInfo) => Promise<HttpAuthCredentials | null>
) {
  return (event: LoginEvent, wc: WebContents, _details: unknown, authInfo: AuthInfo, callback: LoginCallback) => {
    event.preventDefault();
    prompt(wc, authInfo).then(
      cred => (cred ? callback(cred.username, cred.password) : callback()),
      () => callback()
    );
  };
}

/**
 * Makes HTTP Basic/Digest auth (and proxy auth) work inside webviews: without
 * a 'login' handler Electron cancels such requests outright, so protected
 * pages fail with a blank 401 and no way to sign in.
 */
export function registerHttpAuthHandler(): void {
  electronApp.on('login', createLoginHandler(promptForCredentials));
}
