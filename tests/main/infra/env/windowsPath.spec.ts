/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { expandEnvVars, mergePath, parseRegPath } from '@/infra/env/windowsPath';

describe('the PATH of the registry (Windows)', () => {
  it('reads the Path value from reg query output', () => {
    const out = '\r\nHKEY_CURRENT_USER\\Environment\r\n    Path    REG_EXPAND_SZ    %USERPROFILE%\\.local\\bin;C:\\Tools\r\n\r\n';
    expect(parseRegPath(out)).toBe('%USERPROFILE%\\.local\\bin;C:\\Tools');
    expect(parseRegPath('ERROR: The system was unable to find the specified registry key or value.')).toBeUndefined();
  });

  it('expands %VAR% from the environment (any case), and keeps unknown ones', () => {
    expect(expandEnvVars('%USERPROFILE%\\.local\\bin;%NOPE%\\x', { UserProfile: 'C:\\Users\\me' })).toBe('C:\\Users\\me\\.local\\bin;%NOPE%\\x');
  });

  it('adds the folders the PATH lacks at its end, once, whatever their case or trailing slash', () => {
    expect(mergePath('C:\\Windows;C:\\Tools\\', 'c:\\tools;C:\\Users\\me\\.local\\bin;;C:\\Users\\me\\.local\\bin'))
      .toBe('C:\\Windows;C:\\Tools\\;C:\\Users\\me\\.local\\bin');
    expect(mergePath('', 'C:\\a')).toBe('C:\\a');
  });
});
