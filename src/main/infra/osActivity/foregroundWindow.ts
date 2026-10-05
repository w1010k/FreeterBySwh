/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ChildProcessByStdio, spawn } from 'node:child_process';
import { Readable } from 'node:stream';

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
//
// Windows PowerShell 5.1 writes redirected stdout in the console's OEM code page
// (CP949 on Korean Windows), so non-ASCII app names and titles arrived as U+FFFD.
// Forcing UTF-8 output on the first line makes the bytes match the reader's decoding.
//
// GetWindowText must be imported with CharSet.Unicode: without it .NET binds the
// ANSI variant (GetWindowTextA), which converts the title to the system code page
// and turns every character outside it (e.g. U+2014 em dash, emoji) into '?'.
const psScript = (intervalSec: number, parentPid: number) => `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class FgWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
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

// When PowerShell dies on its own (killed by AV or the user, script error), the
// monitor above still believes it is running and never calls start() again. So the
// reader respawns by itself after a pause, and gives up after a few consecutive
// deaths with no sample in between, so a broken PowerShell can't respawn forever.
const restartDelayMs = 30_000;
const maxConsecutiveFailures = 5;

export function createForegroundWindowReader(intervalSec = 5): ForegroundWindowReader {
  let proc: ChildProcessByStdio<null, Readable, null> | null = null;
  let exitKiller: (() => void) | null = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  let stopped = true;

  const removeExitKiller = () => {
    if (exitKiller) {
      process.removeListener('exit', exitKiller);
      exitKiller = null;
    }
  };

  // Counts one unexpected death and schedules `respawn`, unless stop() ran or
  // the failure budget is spent.
  const scheduleRestart = (respawn: () => void) => {
    failures++;
    if (stopped || failures >= maxConsecutiveFailures) {
      return;
    }
    restartTimer = setTimeout(() => {
      restartTimer = null;
      if (!stopped) {
        respawn();
      }
    }, restartDelayMs);
  };

  const spawnLoop = (onSample: (sample: ForegroundWindowSample) => void) => {
    let child: ChildProcessByStdio<null, Readable, null>;
    try {
      // stderr is ignored: a pipe nobody reads could fill up and block the loop.
      child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript(intervalSec, process.pid)], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      proc = null;
      scheduleRestart(() => spawnLoop(onSample));
      return;
    }
    proc = child;
    // Last-resort kill if the main process exits without stop() running
    // (covers paths app.will-quit may miss). The PS parent-PID watchdog is the
    // backstop for a truly abnormal death where even this can't run.
    exitKiller = () => { try { child.kill(); } catch { /* noop */ } };
    process.once('exit', exitKiller);
    let buf = '';
    // Decode as a stream so a multibyte character split across two chunks stays intact.
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buf += chunk;
      let nl = buf.indexOf('\n');
      while (nl >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        nl = buf.indexOf('\n');
        if (line) {
          try {
            const obj = JSON.parse(line);
            if (obj && typeof obj.app === 'string') {
              // A live sample proves the process works, so the failure streak ends.
              failures = 0;
              onSample({ app: obj.app, title: typeof obj.title === 'string' ? obj.title : '' });
            }
          } catch {
            // ignore malformed lines
          }
        }
      }
    });
    // 'error' and 'exit' can both fire for one death; only the first one for the
    // current child counts. stop() clears `proc` first, so a kill it caused is ignored.
    const onEnd = () => {
      if (proc !== child) {
        return;
      }
      proc = null;
      removeExitKiller();
      scheduleRestart(() => spawnLoop(onSample));
    };
    child.on('error', onEnd);
    child.on('exit', onEnd);
  };

  return {
    start: (onSample) => {
      if (process.platform !== 'win32' || proc || !stopped) {
        return;
      }
      stopped = false;
      failures = 0;
      spawnLoop(onSample);
    },
    stop: () => {
      stopped = true;
      if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
      }
      removeExitKiller();
      if (proc) {
        const child = proc;
        proc = null;
        try { child.kill(); } catch { /* noop */ }
      }
    }
  }
}
