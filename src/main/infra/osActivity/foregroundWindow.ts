/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';

export interface ForegroundWindowSample {
  /** Process name of the foreground window's owner (e.g. "Code", "chrome"). */
  app: string;
  /** Window title text. */
  title: string;
}

export interface ForegroundWindowReader {
  /** Begin emitting samples at a fixed cadence. No-op on unsupported platforms. */
  start(onSample: (sample: ForegroundWindowSample) => void): void;
  stop(): void;
}

// A single long-lived PowerShell loop reads the foreground window via Win32
// (user32) and prints one compact JSON line per tick. One process, low overhead
// — no native module, so packaging stays intact. `$procId` (not `$pid`, which is
// read-only in PowerShell) holds the owner process id.
//
// `parentPid` is the Electron main process id: the loop exits if the parent is
// gone, so the child self-terminates even on an abnormal app exit (crash / kill)
// where Node's `kill()` never runs — Windows has no parent-death signal.
const psScript = (intervalSec: number, parentPid: number) => `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class FgWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
"@
while ($true) {
  if (-not (Get-Process -Id ${parentPid} -ErrorAction SilentlyContinue)) { break }
  $h = [FgWin]::GetForegroundWindow()
  $sb = New-Object System.Text.StringBuilder 512
  [void][FgWin]::GetWindowText($h, $sb, 512)
  $title = $sb.ToString()
  $procId = 0
  [void][FgWin]::GetWindowThreadProcessId($h, [ref]$procId)
  $name = ''
  try { $name = (Get-Process -Id $procId).ProcessName } catch {}
  (@{ app = $name; title = $title } | ConvertTo-Json -Compress)
  Start-Sleep -Seconds ${intervalSec}
}
`;

export function createForegroundWindowReader(intervalSec = 5): ForegroundWindowReader {
  let proc: ChildProcessWithoutNullStreams | null = null;
  let exitKiller: (() => void) | null = null;

  return {
    start: (onSample) => {
      if (process.platform !== 'win32' || proc) {
        return;
      }
      try {
        proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript(intervalSec, process.pid)], {
          windowsHide: true,
        });
      } catch {
        proc = null;
        return;
      }
      // Last-resort kill if the main process exits without stop() running
      // (covers paths app.will-quit may miss). The PS parent-PID watchdog is the
      // backstop for a truly abnormal death where even this can't run.
      const child = proc;
      exitKiller = () => { try { child.kill(); } catch { /* noop */ } };
      process.once('exit', exitKiller);
      let buf = '';
      proc.stdout.on('data', (chunk: Buffer) => {
        buf += chunk.toString('utf-8');
        let nl = buf.indexOf('\n');
        while (nl >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          nl = buf.indexOf('\n');
          if (line) {
            try {
              const obj = JSON.parse(line);
              if (obj && typeof obj.app === 'string') {
                onSample({ app: obj.app, title: typeof obj.title === 'string' ? obj.title : '' });
              }
            } catch {
              // ignore malformed lines
            }
          }
        }
      });
      proc.on('error', () => { proc = null; });
    },
    stop: () => {
      if (exitKiller) {
        process.removeListener('exit', exitKiller);
        exitKiller = null;
      }
      if (proc) {
        try { proc.kill(); } catch { /* noop */ }
        proc = null;
      }
    }
  }
}
