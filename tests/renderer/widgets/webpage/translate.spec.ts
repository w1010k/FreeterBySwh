/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { TRANSLATE_MUTATION_MARKER, translateApplyJs, translateCollectJs, translateLogCaptureJs, translateRestoreJs } from '@/widgets/webpage/translate';
import { translateMaxItems, translateMaxTextChars } from '@common/base/translate';

// The scripts run in the guest page through executeJavaScript; here they run in the jsdom page the same way.
const run = <T>(js: string): T => (0, eval)(js);
const collect = () => run<string[]>(translateCollectJs);
const apply = (tr: string[]) => run<void>(translateApplyJs(tr));
const restore = () => run<void>(translateRestoreJs);

describe('Translate Page scripts', () => {
  afterEach(() => {
    restore();
    document.body.innerHTML = '';
  });

  it('collects visible text and skips code, input, scripts and no-translate parts', () => {
    document.body.innerHTML = `
      <h1>Title</h1>
      <p>Hello <b>world</b> 123</p>
      <script>var x = 1;</script><style>p { color: red }</style>
      <pre>pre text</pre><p><code>codeText</code></p>
      <textarea>typed</textarea>
      <div contenteditable="true"><span>editable</span></div>
      <div translate="no">brand</div><span class="notranslate">keep</span>
      <svg><text>drawn</text></svg>
      <p>   </p><p>42</p>`;

    expect(collect()).toEqual(['Title', 'Hello', 'world']);
  });

  it('replaces text in place and keeps the surrounding whitespace', () => {
    document.body.innerHTML = '<p>  Hello <b>world</b>\n</p>';
    const p = document.querySelector('p')!;

    expect(collect()).toEqual(['Hello', 'world']);
    apply(['안녕', '세계']);

    expect(p.innerHTML).toBe('  안녕 <b>세계</b>\n');
  });

  it('sets text, never HTML', () => {
    document.body.innerHTML = '<p>Hi</p>';

    collect();
    apply(['<img src=x onerror=alert(1)>']);

    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('p')).toHaveTextContent(/^<img src=x onerror=alert\(1\)>$/);
  });

  it('does not collect translated text again, but collects text the page changed', () => {
    document.body.innerHTML = '<p>One</p><p>Two</p>';
    collect();
    apply(['하나', '둘']);

    expect(collect()).toEqual([]);

    document.querySelectorAll('p')[1].firstChild!.nodeValue = 'Three';
    expect(collect()).toEqual(['Three']);
  });

  it('skips a node the page changed between collect and apply', () => {
    document.body.innerHTML = '<p>One</p>';
    const text = document.querySelector('p')!.firstChild!;

    collect();
    text.nodeValue = 'Changed';
    apply(['하나']);

    expect(text.nodeValue).toBe('Changed');
    expect(collect()).toEqual(['Changed']);
  });

  it('ignores an apply whose batch does not match', () => {
    document.body.innerHTML = '<p>One</p>';

    collect();
    apply(['하나', 'extra']);

    expect(document.body).toHaveTextContent(/^One$/);
  });

  it('restores the original text, except where the page changed it since', () => {
    document.body.innerHTML = '<p>One</p><p>Two</p>';
    const [p1, p2] = Array.from(document.querySelectorAll('p'));
    collect();
    apply(['하나', '둘']);
    p2.firstChild!.nodeValue = 'Page update';

    restore();

    expect(p1).toHaveTextContent(/^One$/);
    expect(p2).toHaveTextContent(/^Page update$/);
    expect((window as unknown as { __freeterTranslate: unknown }).__freeterTranslate).toBeNull();
  });

  it('restores a node the page removed and attached again', () => {
    document.body.innerHTML = '<div id="panel"><p>Tab text</p></div><div id="host"></div>';
    const panel = document.getElementById('panel')!;
    collect();
    apply(['탭 글자']);

    panel.remove();
    collect();
    document.getElementById('host')!.appendChild(panel);
    restore();

    expect(panel).toHaveTextContent(/^Tab text$/);
  });

  it('signals through the console.log kept at dom-ready, even after the page silenced console.log', async () => {
    jest.useFakeTimers();
    const kept = jest.fn();
    const original = console.log;
    console.log = kept;
    run(translateLogCaptureJs);
    console.log = () => undefined;
    try {
      document.body.innerHTML = '<p>One</p>';
      collect();
      document.body.insertAdjacentHTML('beforeend', '<p>Two</p>');
      await Promise.resolve();
      jest.advanceTimersByTime(1000);

      expect(kept).toHaveBeenCalledWith(TRANSLATE_MUTATION_MARKER);
    } finally {
      console.log = original;
      delete (window as unknown as { __freeterTranslateLog?: unknown }).__freeterTranslateLog;
      jest.useRealTimers();
    }
  });

  it('collects at most one batch per round, and skips a single text that is too long', () => {
    document.body.innerHTML = `<p>${'a'.repeat(translateMaxTextChars + 1)}</p>`
      + Array.from({ length: translateMaxItems + 3 }, (_, i) => `<p>t${i}</p>`).join('');

    const first = collect();
    expect(first).toHaveLength(translateMaxItems);
    expect(first[0]).toBe('t0');
    apply(first.map(t => `KO${t}`));

    expect(collect()).toEqual([`t${translateMaxItems}`, `t${translateMaxItems + 1}`, `t${translateMaxItems + 2}`]);
  });

  it('watches the page from the first collect, so text rendered later is reported even when nothing was found', async () => {
    jest.useFakeTimers();
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      document.body.innerHTML = '<div id="app"></div>';
      expect(collect()).toEqual([]);

      document.getElementById('app')!.innerHTML = '<p>Rendered later</p>';
      await Promise.resolve();
      jest.advanceTimersByTime(1000);

      expect(log).toHaveBeenCalledWith(TRANSLATE_MUTATION_MARKER);
    } finally {
      log.mockRestore();
      jest.useRealTimers();
    }
  });

  it('reports within the max wait on a page that never stops changing, and ignores changes without letters', async () => {
    jest.useFakeTimers();
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const signals = () => log.mock.calls.filter(c => c[0] === TRANSLATE_MUTATION_MARKER).length;
    try {
      document.body.innerHTML = '<span id="n">0</span>';
      collect();
      const counter = document.getElementById('n')!.firstChild!;
      for (let i = 1; i <= 30; i++) {
        counter.nodeValue = String(i);
        await Promise.resolve();
        jest.advanceTimersByTime(100);
      }
      expect(signals()).toBe(0);

      for (let i = 0; i < 30; i++) {
        document.body.insertAdjacentHTML('beforeend', `<p>Line ${i}</p>`);
        await Promise.resolve();
        jest.advanceTimersByTime(100);
      }
      expect(signals()).toBeGreaterThanOrEqual(1);
    } finally {
      log.mockRestore();
      jest.useRealTimers();
    }
  });

  it('reports new text after a translation, debounced, and not its own changes', async () => {
    jest.useFakeTimers();
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      document.body.innerHTML = '<p>One</p>';
      collect();
      apply(['하나']);
      await Promise.resolve();
      jest.advanceTimersByTime(1000);
      expect(log).not.toHaveBeenCalledWith(TRANSLATE_MUTATION_MARKER);

      document.body.insertAdjacentHTML('beforeend', '<p>Two</p>');
      document.body.insertAdjacentHTML('beforeend', '<p>Three</p>');
      await Promise.resolve();
      jest.advanceTimersByTime(1000);

      expect(log.mock.calls.filter(c => c[0] === TRANSLATE_MUTATION_MARKER)).toHaveLength(1);
    } finally {
      log.mockRestore();
      jest.useRealTimers();
    }
  });
});
