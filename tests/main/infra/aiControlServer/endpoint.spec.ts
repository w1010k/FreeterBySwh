/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { mkdtemp, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAiPipePath, removeAiEndpointSync, writeAiEndpoint } from '@/infra/aiControlServer/endpoint';

describe('getAiPipePath', () => {
  it('gives a stable per-folder named pipe on Windows', () => {
    const a = getAiPipePath('C:\\x', 'win32');
    expect(a).toMatch(/^\\\\\.\\pipe\\freeter-swh-[0-9a-f]{12}$/);
    expect(getAiPipePath('C:\\x', 'win32')).toBe(a);
    expect(getAiPipePath('C:\\y', 'win32')).not.toBe(a);
  });

  it('gives a socket file under ai/ on Linux', () => {
    expect(getAiPipePath('/x', 'linux')).toBe(join('/x', 'ai', 'control.sock'));
  });
});

describe('endpoint file', () => {
  it('writes ai/endpoint.json and removes it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'freeter-ep-'));
    await writeAiEndpoint(dir, { pipe: 'p', token: 't', pid: 1 });
    const file = join(dir, 'ai', 'endpoint.json');
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ pipe: 'p', token: 't', pid: 1 });
    removeAiEndpointSync(dir);
    expect(existsSync(file)).toBe(false);
  });

  it('ignores a missing file on remove', () => {
    expect(() => removeAiEndpointSync(join(tmpdir(), 'no-such-freeter-dir'))).not.toThrow();
  });
});
