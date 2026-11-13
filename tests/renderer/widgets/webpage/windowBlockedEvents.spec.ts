/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { describeBlockedWindow } from '@/widgets/webpage/windowBlockedEvents';

describe('describeBlockedWindow()', () => {
  const appLinks = ['zoommtg://zoom.us/j/1', 'msteams:/l/meetup-join/x', 'slack://open', 'webex://x', 'tel:+821012345678'];
  it.each(appLinks)('offers to open the meeting or chat app link %s', url => {
    expect(describeBlockedWindow({ url, reason: 'scheme' }).action?.label).toMatch(/^Open .+: link$/);
  });

  const reportedOnly = ['file:///C:/x.exe', 'ms-msdt:/id', 'search-ms:query=x', 'javascript:alert(1)', 'not a url'];
  it.each(reportedOnly)('only reports %s', url => {
    expect(describeBlockedWindow({ url, reason: 'scheme' }).action).toBeUndefined();
  });

  it('offers the browser for a web popup over the limit, nothing for an empty one', () => {
    expect(describeBlockedWindow({ url: 'https://idp.test/', reason: 'popupLimit' }).action).toEqual({ label: 'Open in browser', url: 'https://idp.test/' });
    expect(describeBlockedWindow({ url: '', reason: 'popupLimit' }).action).toBeUndefined();
  });

  it('opens the parsed address, not the raw string the page sent', () => {
    expect(describeBlockedWindow({ url: '\tzoommtg://zoom.us/j/1', reason: 'scheme' }).action?.url).toBe('zoommtg://zoom.us/j/1');
  });

  it('names the shared popup limit', () => {
    expect(describeBlockedWindow({ url: '', reason: 'popupLimit' }).text).toContain('already has 5 open');
  });
});
