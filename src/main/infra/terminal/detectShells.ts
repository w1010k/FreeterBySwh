/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { posix, win32 } from 'node:path';
import { ShellOption } from '@common/ipc/channels';

interface Deps {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  exists: (path: string) => boolean;
  /** undefined when the file cannot be read. */
  readFile: (path: string) => string | undefined;
  /** Windows: a Linux distribution is installed (wsl.exe comes with Windows 11 without one). */
  hasWslDistro: () => boolean;
}

/** Listed in /etc/shells but not shells to open a tab with. */
const NOT_SHELLS = new Set(['tmux', 'screen', 'rbash', 'nologin', 'false', 'git-shell']);

/**
 * The shells a new terminal tab can run, found once when first needed (after the PATH merge). The first is the default.
 * ponytail: known install folders only; a shell installed elsewhere is still usable through the Shell setting.
 */
export function detectShells({ platform, env, exists, readFile, hasWslDistro }: Deps): ShellOption[] {
  if (platform === 'win32') {
    const pathDirs = (env.PATH ?? '').split(';').filter(Boolean);
    const programFiles = [env.ProgramFiles, env['ProgramFiles(x86)']].filter((d): d is string => !!d);
    const first = (paths: string[]) => paths.find(exists);
    const pwsh = first([...pathDirs, ...programFiles.map(d => win32.join(d, 'PowerShell', '7'))].map(d => win32.join(d, 'pwsh.exe')));
    const gitBash = first([...programFiles, ...(env.LOCALAPPDATA ? [win32.join(env.LOCALAPPDATA, 'Programs')] : [])]
      .map(d => win32.join(d, 'Git', 'bin', 'bash.exe')));
    const wsl = first([win32.join(env.SystemRoot || 'C:\\Windows', 'System32', 'wsl.exe')]);
    return [
      ...(pwsh ? [{ label: 'PowerShell 7', shell: pwsh }] : []),
      { label: 'Windows PowerShell', shell: 'powershell.exe' },
      { label: 'Command Prompt', shell: 'cmd.exe' },
      ...(gitBash ? [{ label: 'Git Bash', shell: gitBash }] : []),
      ...(wsl && hasWslDistro() ? [{ label: 'WSL', shell: wsl }] : []),
    ];
  }
  const listed = (readFile('/etc/shells') ?? '').split('\n').map(l => l.trim()).filter(l => l.startsWith('/'));
  // One per name: merged-/usr systems list /bin/bash and /usr/bin/bash.
  const byName = new Map<string, string>();
  for (const shell of [...(env.SHELL ? [env.SHELL] : []), ...listed]) {
    const name = posix.basename(shell);
    if (!byName.has(name) && !NOT_SHELLS.has(name) && exists(shell)) {
      byName.set(name, shell);
    }
  }
  return [...byName].map(([label, shell]) => ({ label, shell }));
}
