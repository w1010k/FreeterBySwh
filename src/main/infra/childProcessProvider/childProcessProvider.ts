/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { spawn } from 'node:child_process';
import { ChildProcessProvider } from '@/application/interfaces/childProcessProvider';

export function createChildProcessProvider(): ChildProcessProvider {
  return {
    spawnDetached: (cmd, args, opts = {}) => {
      const proc = spawn(cmd, args, {
        ...opts,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      // spawn reports a missing program or cwd (ENOENT) asynchronously via 'error'.
      // Without a listener that becomes an uncaught exception in main and pops
      // Electron's crash dialog, so log it instead.
      proc.on('error', err => console.error(`Failed to start '${cmd}':`, err));
      proc.unref();
    }
  }
}
