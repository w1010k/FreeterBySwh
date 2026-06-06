/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { app, session as electronSession, Session } from 'electron';
import { existsSync } from 'node:original-fs';
import { join, extname, basename } from 'node:path';

/**
 * Resolve a non-colliding save path inside `dir` for `filename`, browser-style:
 * `a.txt`, then `a (1).txt`, `a (2).txt`, … `exists` is injected so the core
 * logic stays testable without touching the real filesystem.
 */
export function resolveUniqueSavePath(dir: string, filename: string, exists: (p: string) => boolean): string {
  const first = join(dir, filename);
  if (!exists(first)) {
    return first;
  }
  const ext = extname(filename);
  const base = basename(filename, ext);
  let n = 1;
  let candidate: string;
  do {
    candidate = join(dir, `${base} (${n})${ext}`);
    n += 1;
  } while (exists(candidate));
  return candidate;
}

export interface DownloadManager {
  /** Set the directory downloads are saved to. Empty string = OS default (~/Downloads). */
  setDownloadDir(dir: string): void;
}

/**
 * Routes all downloads (from the app window and every <webview> partition) to a
 * fixed folder instead of prompting with a save dialog each time. Defaults to
 * the OS Downloads folder; `setDownloadDir` overrides it (empty restores the
 * default). Filename collisions get a ` (n)` suffix.
 */
export function createDownloadManager(): DownloadManager {
  let customDir = '';
  const targetDir = () => (customDir.trim() !== '' ? customDir : app.getPath('downloads'));

  const attach = (ses: Session) => {
    ses.on('will-download', (_event, item) => {
      try {
        item.setSavePath(resolveUniqueSavePath(targetDir(), item.getFilename(), existsSync));
      } catch {
        // On any failure, leave Electron's default behavior (the save dialog).
      }
    });
  };

  // Existing default session + every session created later (webview partitions
  // are created lazily when a webview first loads, after this listener is set).
  attach(electronSession.defaultSession);
  app.on('session-created', attach);

  return {
    setDownloadDir: (dir) => { customDir = typeof dir === 'string' ? dir : ''; }
  };
}
