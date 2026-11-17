/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { actionPresets } from '@/widgets/webpage/actionPresets';

// Runs a preset the way the widget does (a script in the page), here in the jsdom page.
function run(name: string) {
  const preset = actionPresets.find(p => p.name === name);
  if (!preset) {
    throw new Error(`no preset ${name}`);
  }
  new Function(preset.js)();
}

describe('Webpage action presets', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('style');
  });

  it('have unique, non-empty names and code that parses', () => {
    const names = actionPresets.map(p => p.name);
    expect(new Set(names).size).toBe(names.length);
    for (const preset of actionPresets) {
      expect(preset.name.trim()).not.toBe('');
      expect(() => new Function(preset.js)).not.toThrow();
    }
  });

  it('Toggle Dark Filter adds a sheet of its own, leaves the page styles alone, and a second run removes the sheet', () => {
    // jsdom has no constructable stylesheets: a stub records the rules the preset writes.
    class SheetStub {
      text = '';
      replaceSync(text: string) {
        this.text = text;
      }
    }
    Object.defineProperty(window, 'CSSStyleSheet', { value: SheetStub, configurable: true, writable: true });
    Object.defineProperty(document, 'adoptedStyleSheets', { value: [], configurable: true, writable: true });
    const sheets = () => (document as unknown as { adoptedStyleSheets: SheetStub[] }).adoptedStyleSheets;
    document.body.innerHTML = '<picture><img src="x.png" style="filter: grayscale(1)"></picture>';
    document.documentElement.style.backgroundColor = 'rgb(1, 2, 3)';

    run('Toggle Dark Filter');
    expect(sheets()).toHaveLength(1);
    expect(sheets()[0].text).toContain('html { filter: invert(1) hue-rotate(180deg) !important;');
    // The counter-invert goes on the <img> only, not on the <picture> around it.
    expect(sheets()[0].text).toContain('img, video, canvas, iframe { filter: invert(1) hue-rotate(180deg) !important; }');
    expect(sheets()[0].text).not.toContain('picture');

    run('Toggle Dark Filter');
    expect(sheets()).toHaveLength(0);
    expect(document.querySelector('img')).toHaveStyle({ filter: 'grayscale(1)' });
    expect(document.documentElement).toHaveStyle({ backgroundColor: 'rgb(1, 2, 3)' });
  });

  it('Hide Sticky Elements hides fixed and sticky elements only', () => {
    document.body.innerHTML = '<header style="position: fixed"></header><nav style="position: sticky"></nav><main></main>';
    run('Hide Sticky Elements');
    expect(document.querySelector('header')!).toHaveStyle({ display: 'none' });
    expect(document.querySelector('nav')!).toHaveStyle({ display: 'none' });
    expect(document.querySelector('main')!).not.toHaveStyle({ display: 'none' });
  });

  it('Allow Text Selection undoes user-select and stops the page from cancelling copy', () => {
    document.body.innerHTML = '<p style="user-select: none">text</p>';
    const p = document.querySelector('p')!;
    const pageHandler = jest.fn((e: Event) => e.preventDefault());
    p.addEventListener('copy', pageHandler);
    run('Allow Text Selection');
    expect(p.style.getPropertyValue('user-select')).toBe('text');
    p.dispatchEvent(new Event('copy', { bubbles: true, cancelable: true }));
    expect(pageHandler).not.toHaveBeenCalled();
  });

  it('Video Speed 1x/2x switches every video between 2x and 1x', () => {
    document.body.innerHTML = '<video></video><video></video>';
    const videos = [...document.querySelectorAll('video')];
    run('Video Speed 1x/2x');
    expect(videos.map(v => v.playbackRate)).toEqual([2, 2]);
    run('Video Speed 1x/2x');
    expect(videos.map(v => v.playbackRate)).toEqual([1, 1]);
  });

  it('Expand All Sections opens every closed details element', () => {
    document.body.innerHTML = '<details><summary>a</summary></details><details open><summary>b</summary></details>';
    run('Expand All Sections');
    expect([...document.querySelectorAll('details')].map(d => d.open)).toEqual([true, true]);
  });
});
