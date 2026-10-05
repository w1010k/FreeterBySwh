/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { isAllowedExternalUrl } from '@common/helpers/isAllowedExternalUrl';

describe('isAllowedExternalUrl', () => {
  it.each([
    'https://freeter.io/',
    'http://localhost:4000/page',
    'mailto:someone@example.com',
  ])('should allow the web or mail url %s', (url) => {
    expect(isAllowedExternalUrl(url)).toBe(true);
  })

  it.each([
    'file:///C:/Windows/System32/calc.exe',
    'javascript:alert(1)',
    'ms-settings:privacy',
    'slack://open',
    'about:blank',
  ])('should reject the non-web url %s', (url) => {
    expect(isAllowedExternalUrl(url)).toBe(false);
  })

  it('should reject unparsable input', () => {
    expect(isAllowedExternalUrl('')).toBe(false);
    expect(isAllowedExternalUrl('invalid^url')).toBe(false);
  })
});
