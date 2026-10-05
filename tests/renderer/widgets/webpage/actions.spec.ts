/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { openCurrentInBrowser, openLinkInBrowser, zoomLevels, zoomReset, zoomStepIn, zoomStepOut } from '@/widgets/webpage/actions';
import { WidgetApi } from '@/widgets/appModules';

function mockWebview(initialZoom: number) {
  let current = initialZoom;
  return {
    getZoomFactor: () => current,
    setZoomFactor: jest.fn((factor: number) => { current = factor; }),
  } as unknown as Electron.WebviewTag & { setZoomFactor: jest.Mock };
}

describe('Webpage zoom step helpers', () => {
  describe('zoomStepIn', () => {
    it('should move to the next higher preset', () => {
      const wv = mockWebview(1);
      zoomStepIn(wv);
      expect(wv.setZoomFactor).toHaveBeenCalledWith(1.1);
    })

    it('should not go above the max preset', () => {
      const wv = mockWebview(zoomLevels[zoomLevels.length - 1]);
      zoomStepIn(wv);
      expect(wv.setZoomFactor).not.toHaveBeenCalled();
    })

    it('should tolerate small floating-point drift around a preset', () => {
      const wv = mockWebview(1 + 1e-9);
      zoomStepIn(wv);
      expect(wv.setZoomFactor).toHaveBeenCalledWith(1.1);
    })
  })

  describe('zoomStepOut', () => {
    it('should move to the next lower preset', () => {
      const wv = mockWebview(1);
      zoomStepOut(wv);
      expect(wv.setZoomFactor).toHaveBeenCalledWith(0.9);
    })

    it('should not go below the min preset', () => {
      const wv = mockWebview(zoomLevels[0]);
      zoomStepOut(wv);
      expect(wv.setZoomFactor).not.toHaveBeenCalled();
    })

    it('should find the nearest lower preset when between presets', () => {
      const wv = mockWebview(1.2);
      zoomStepOut(wv);
      expect(wv.setZoomFactor).toHaveBeenCalledWith(1.1);
    })
  })

  describe('zoomReset', () => {
    it('should always set zoom to 1', () => {
      const wv = mockWebview(2);
      zoomReset(wv);
      expect(wv.setZoomFactor).toHaveBeenCalledWith(1);
    })
  })
})

// Guest-page URLs must not reach the OS unless they use a web or mail scheme.
describe('Webpage open-in-browser actions', () => {
  function mockWidgetApi() {
    const openExternalUrl = jest.fn();
    return { widgetApi: { shell: { openExternalUrl } } as unknown as WidgetApi, openExternalUrl };
  }
  const webviewAt = (url: string) => ({ getURL: () => url }) as unknown as Electron.WebviewTag;

  it('should hand a web page address to the OS', () => {
    const { widgetApi, openExternalUrl } = mockWidgetApi();
    openCurrentInBrowser(webviewAt('https://freeter.io/'), widgetApi);
    expect(openExternalUrl).toHaveBeenCalledWith('https://freeter.io/');
  })

  it('should drop a page address with a non-web scheme', () => {
    const { widgetApi, openExternalUrl } = mockWidgetApi();
    openCurrentInBrowser(webviewAt('file:///C:/Windows/System32/calc.exe'), widgetApi);
    expect(openExternalUrl).not.toHaveBeenCalled();
  })

  it('should drop a link with a non-web scheme', () => {
    const { widgetApi, openExternalUrl } = mockWidgetApi();
    openLinkInBrowser('slack://open', widgetApi);
    expect(openExternalUrl).not.toHaveBeenCalled();
  })
})
