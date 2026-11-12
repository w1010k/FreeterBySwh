/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

// Translate Page: scripts run in the guest page with `executeJavaScript`. They swap the text of text nodes in place,
// so the layout, links and styles stay as they are. The text goes to Google through main (`widgetApi.translate`),
// not from the page: page CSP and CORS can't block it. Text is set with `nodeValue`, never as HTML.
//
// Page state lives in `window.__freeterTranslate`:
//   pending: the batch the last collect returned, applied by the next apply (one batch in flight per page).
//   done:    every node we changed, with its original text, for Show Original. Removed nodes stay listed: a web app
//            may attach them again (tab panels, virtual lists), and Show Original must still restore them.
//            ponytail: so a long-lived page keeps its removed text nodes until Show Original or navigation.
//   val:     node → text we set; a node whose text still equals it is not collected again.
//   obs:     MutationObserver, started by the first collect, that reports new or changed text (debounced) with
//            TRANSLATE_MUTATION_MARKER.
// A navigation drops the state with the page; the widget translates the new page again on dom-ready.

import { translateMaxChars, translateMaxItems, translateMaxTextChars } from '@common/base/translate';

/** Logged by the page (debounced) when its text changed after a translation. The widget then translates the new text. */
export const TRANSLATE_MUTATION_MARKER = '__FREETER_WEBPAGE_TRANSLATE_MUTATED__';

// Subtrees that are code, user input, or marked not to translate. `svg` and `math` text is part of a drawing.
const skipSelector = [
  'script', 'style', 'noscript', 'template', 'textarea', 'input', 'select', 'code', 'pre', 'kbd', 'samp', 'svg', 'math',
  '[contenteditable=""]', '[contenteditable="true"]', '[contenteditable="plaintext-only"]', '[translate="no"]', '.notranslate'
].join(',');

// The signal waits for 500 ms without changes, but never more than 2 s after the first change, so a page that changes
// all the time (a ticker, a typing indicator) still gets its new text translated.
// ponytail: each signal walks the whole document again. Walk only the subtrees in the mutation records if huge,
// always-changing pages show jank.
const signalQuietMs = 500;
const signalMaxWaitMs = 2000;

/**
 * Run on dom-ready: keeps console.log as the page first had it. Many sites replace console.log with a no-op later in
 * production; the translation signal must still reach the widget. Ceiling: a page that replaces it before dom-ready.
 */
export const translateLogCaptureJs = `
(function() {
  if (!window.__freeterTranslateLog) { window.__freeterTranslateLog = console.log.bind(console); }
})()
`;

/**
 * Returns the next batch of texts to translate (an empty array when nothing is left) and keeps it as `pending`.
 * The first call on a page also starts watching it, so text that a web app renders later is translated too.
 */
export const translateCollectJs = `
(function(maxItems, maxChars, maxTextChars, skip, marker, quietMs, maxWaitMs) {
  if (!document.body) { return []; }
  var letter = /\\p{L}/u;
  var S = window.__freeterTranslate;
  if (!S) {
    S = window.__freeterTranslate = { pending: null, done: [], val: new WeakMap(), obs: null, timer: 0, first: 0 };
    var log = window.__freeterTranslateLog || console.log.bind(console);
    var signal = function() { S.first = 0; log(marker); };
    // Only changes that bring letters count; the text we set ourselves is dropped in apply (takeRecords).
    var hasText = function(r) {
      if (r.type === 'characterData') { return letter.test(r.target.nodeValue || '') && S.val.get(r.target) !== r.target.nodeValue; }
      for (var i = 0; i < r.addedNodes.length; i++) {
        if (letter.test(r.addedNodes[i].textContent || '')) { return true; }
      }
      return false;
    };
    S.obs = new MutationObserver(function(records) {
      if (!records.some(hasText)) { return; }
      var now = Date.now();
      if (!S.first) { S.first = now; }
      clearTimeout(S.timer);
      S.timer = setTimeout(signal, Math.max(0, Math.min(quietMs, S.first + maxWaitMs - now)));
    });
    S.obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  S.pending = null;
  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: function(n) {
      if (n.nodeType === 1) { return n.matches(skip) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP; }
      var v = n.nodeValue;
      return S.val.get(n) !== v && letter.test(v) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }
  });
  var pending = [], texts = [], chars = 0, n;
  while ((n = walker.nextNode())) {
    var v = n.nodeValue;
    var core = v.trim();
    // A very long single text is left as it is (main rejects it).
    if (core.length > maxTextChars) { continue; }
    if (pending.length >= maxItems || chars + core.length > maxChars) { break; }
    // trim() and indexOf agree: the first non-space character starts the core.
    var lead = v.slice(0, v.indexOf(core));
    pending.push({ node: n, orig: v, lead: lead, trail: v.slice(lead.length + core.length) });
    texts.push(core);
    chars += core.length;
  }
  S.pending = pending;
  return texts;
})(${translateMaxItems}, ${translateMaxChars}, ${translateMaxTextChars}, ${JSON.stringify(skipSelector)},
  ${JSON.stringify(TRANSLATE_MUTATION_MARKER)}, ${signalQuietMs}, ${signalMaxWaitMs})
`;

/** Puts the translations of the pending batch into the page. */
export function translateApplyJs(translations: string[]): string {
  return `
(function(tr) {
  var S = window.__freeterTranslate;
  if (!S || !S.pending || S.pending.length !== tr.length) { return; }
  var p = S.pending;
  S.pending = null;
  for (var i = 0; i < p.length; i++) {
    var r = p[i];
    // The page changed this text while it was being translated: leave it for the next round.
    if (r.node.nodeValue !== r.orig || typeof tr[i] !== 'string') { continue; }
    var t = r.lead + tr[i] + r.trail;
    r.node.nodeValue = t;
    S.val.set(r.node, t);
    S.done.push({ node: r.node, orig: r.orig, val: t });
  }
  // Drop the records of our own changes, or every apply would trigger another round.
  S.obs.takeRecords();
})(${JSON.stringify(translations)})
`;
}

/** Puts back the original text of every node we changed that the page has not changed since, and stops watching. */
export const translateRestoreJs = `
(function() {
  var S = window.__freeterTranslate;
  if (!S) { return; }
  if (S.obs) { S.obs.disconnect(); }
  clearTimeout(S.timer);
  for (var i = S.done.length - 1; i >= 0; i--) {
    var d = S.done[i];
    if (d.node.nodeValue === d.val) { d.node.nodeValue = d.orig; }
  }
  window.__freeterTranslate = null;
})()
`;
