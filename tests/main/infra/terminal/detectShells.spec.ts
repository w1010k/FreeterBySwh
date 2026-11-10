/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { detectShells } from '@/infra/terminal/detectShells';

const win = (files: string[], env: Record<string, string> = {}, hasWslDistro = true) => detectShells({
  platform: 'win32',
  env: { PATH: 'C:\\Windows\\System32;C:\\Tools', ProgramFiles: 'C:\\Program Files', SystemRoot: 'C:\\Windows', ...env },
  exists: p => files.includes(p),
  readFile: () => undefined,
  hasWslDistro: () => hasWslDistro,
});

describe('detectShells()', () => {
  it('on Windows lists PowerShell 7 first when found on PATH, then the built-in shells, Git Bash and WSL', () => {
    expect(win(['C:\\Tools\\pwsh.exe', 'C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Windows\\System32\\wsl.exe'])).toEqual([
      { label: 'PowerShell 7', shell: 'C:\\Tools\\pwsh.exe' },
      { label: 'Windows PowerShell', shell: 'powershell.exe' },
      { label: 'Command Prompt', shell: 'cmd.exe' },
      { label: 'Git Bash', shell: 'C:\\Program Files\\Git\\bin\\bash.exe' },
      { label: 'WSL', shell: 'C:\\Windows\\System32\\wsl.exe' },
    ]);
  });

  it('on Windows finds PowerShell 7 in its install folder when PATH does not have it', () => {
    expect(win(['C:\\Program Files\\PowerShell\\7\\pwsh.exe'])[0]).toEqual({ label: 'PowerShell 7', shell: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe' });
  });

  it('on Windows leaves out WSL when no Linux distribution is installed (wsl.exe comes with Windows)', () => {
    expect(win([String.raw`C:\Windows\System32\wsl.exe`], {}, false).map(s => s.label)).toEqual(['Windows PowerShell', 'Command Prompt']);
  });

  it('on Windows lists only the built-in shells when nothing else is installed', () => {
    expect(win([]).map(s => s.label)).toEqual(['Windows PowerShell', 'Command Prompt']);
  });

  it('elsewhere lists $SHELL first, then the existing shells of /etc/shells, once each', () => {
    const shells = detectShells({
      platform: 'linux',
      env: { SHELL: '/bin/zsh' },
      exists: p => ['/bin/bash', '/bin/zsh'].includes(p),
      readFile: () => '# comment\n/bin/sh-missing\n/bin/bash\n/bin/zsh\n',
      hasWslDistro: () => false,
    });
    expect(shells).toEqual([{ label: 'zsh', shell: '/bin/zsh' }, { label: 'bash', shell: '/bin/bash' }]);
  });

  it('elsewhere shows each shell name once and leaves out programs that are not shells (merged /usr, tmux)', () => {
    const shells = detectShells({
      platform: 'linux',
      env: {},
      exists: () => true,
      readFile: () => '/bin/sh\n/bin/bash\n/usr/bin/bash\n/bin/rbash\n/usr/bin/tmux\n/usr/bin/screen\n/usr/bin/sh\n',
      hasWslDistro: () => false,
    });
    expect(shells.map(s => s.shell)).toEqual(['/bin/sh', '/bin/bash']);
  });
});
