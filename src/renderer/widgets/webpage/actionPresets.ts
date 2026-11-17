/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

// Ready-made custom actions. Picking one copies its name and code into a new custom action
// row, so the user can edit it, and later app versions never change a saved action.
// Each snippet must work on any site. It runs in the page as a classic script (executeJavaScript),
// so it sets styles through the CSSOM (element.style, constructed stylesheets), which a page's CSP
// style-src does not block; a <style> element would be blocked.
export interface ActionPreset {
  name: string;
  js: string;
}

// Scrolls the page and every scrolled inner box (web apps such as Slack or Notion scroll a
// box, not the window).
const scrollAll = (to: string) =>
  '(() => { const root = document.scrollingElement; ' +
  'const boxes = [...document.querySelectorAll(\'body *\')].filter(e => e.scrollHeight > e.clientHeight + 1 && ' +
  '/(auto|scroll)/.test(getComputedStyle(e).overflowY)); ' +
  `[root, ...boxes].forEach(e => { if (e) { e.scrollTo({ top: ${to}, behavior: 'smooth' }); } }); })()`;

export const actionPresets: readonly ActionPreset[] = [
  {
    name: 'Scroll to Top',
    js: scrollAll('0')
  },
  {
    name: 'Scroll to Bottom',
    js: scrollAll('e.scrollHeight')
  },
  {
    // Inverts the page, then inverts media back so photos and videos keep their colors. A page
    // without a background color gets white first, or the inverted page shows on white.
    // The rules live in a stylesheet of the preset's own (adoptedStyleSheets): the page's inline
    // styles stay as they are, turning it off removes only that sheet, and media loaded later get
    // the rule too. Only leaf media get the counter-invert: an <img> inside a <picture> would
    // otherwise be inverted three times.
    name: 'Toggle Dark Filter',
    js: '(() => { const k = \'__acedeckDarkFilter\'; const old = window[k]; ' +
      'if (old) { document.adoptedStyleSheets = document.adoptedStyleSheets.filter(s => s !== old); window[k] = null; return; } ' +
      'const f = \'filter: invert(1) hue-rotate(180deg) !important;\'; ' +
      'const bg = getComputedStyle(document.documentElement).backgroundColor === \'rgba(0, 0, 0, 0)\' ? \' background-color: #fff !important;\' : \'\'; ' +
      'const s = new CSSStyleSheet(); s.replaceSync(\'html { \' + f + bg + \' } img, video, canvas, iframe { \' + f + \' }\'); ' +
      'document.adoptedStyleSheets = [...document.adoptedStyleSheets, s]; window[k] = s; })()'
  },
  {
    // Fixed headers, cookie banners and chat bubbles. Reload the page to bring them back.
    name: 'Hide Sticky Elements',
    js: '(() => { document.querySelectorAll(\'body *\').forEach(e => { const p = getComputedStyle(e).position; ' +
      'if (p === \'fixed\' || p === \'sticky\') { e.style.setProperty(\'display\', \'none\', \'important\'); } }); })()'
  },
  {
    // Undoes user-select: none, and stops the page's handlers that cancel selecting, copying
    // and the context menu. Listeners the page added on window before this runs still run.
    name: 'Allow Text Selection',
    js: '(() => { document.querySelectorAll(\'*\').forEach(e => { e.style.setProperty(\'user-select\', \'text\', \'important\'); }); ' +
      '[\'selectstart\', \'copy\', \'cut\', \'contextmenu\'].forEach(t => window.addEventListener(t, ev => ev.stopImmediatePropagation(), true)); })()'
  },
  {
    name: 'Video Speed 1x/2x',
    js: '(() => { const vs = [...document.querySelectorAll(\'video\')]; const fast = vs.some(v => v.playbackRate < 2); ' +
      'vs.forEach(v => { v.playbackRate = fast ? 2 : 1; }); })()'
  },
  {
    name: 'Expand All Sections',
    js: 'document.querySelectorAll(\'details:not([open])\').forEach(d => { d.open = true; })'
  },
];
