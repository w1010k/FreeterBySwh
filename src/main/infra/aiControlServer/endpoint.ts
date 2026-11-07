/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

export interface AiEndpointInfo {
  pipe: string;
  token: string;
  pid: number;
}

/** The installed app and a repo run use different data folders, so they get different pipes. */
export function getAiPipePath(appDataDir: string, platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    return `\\\\.\\pipe\\freeter-swh-${createHash('sha256').update(appDataDir).digest('hex').slice(0, 12)}`;
  }
  return join(appDataDir, 'ai', 'control.sock');
}

const endpointFile = (appDataDir: string) => join(appDataDir, 'ai', 'endpoint.json');

export async function writeAiEndpoint(appDataDir: string, info: AiEndpointInfo): Promise<void> {
  await mkdir(join(appDataDir, 'ai'), { recursive: true });
  await writeFile(endpointFile(appDataDir), JSON.stringify(info), { mode: 0o600 });
}

/** Sync: it runs in 'will-quit', where async work may not finish. */
export function removeAiEndpointSync(appDataDir: string): void {
  rmSync(endpointFile(appDataDir), { force: true });
}
