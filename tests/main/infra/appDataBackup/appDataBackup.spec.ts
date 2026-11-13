/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backupMarkerFile, createAppDataBackup } from '@/infra/appDataBackup/appDataBackup';

let root: string;
let dataDir: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'freeter-backup-'));
  dataDir = join(root, 'freeter-data');
  await mkdir(join(dataDir, 'widgets', 'w1'), { recursive: true });
  await mkdir(join(dataDir, 'telemetry'), { recursive: true });
  await mkdir(join(dataDir, 'ai'), { recursive: true });
  await writeFile(join(dataDir, 'app'), '{"v":"current"}');
  await writeFile(join(dataDir, 'window'), '{"w":1}');
  await writeFile(join(dataDir, 'widgets', 'w1', 'note'), 'current note');
  await writeFile(join(dataDir, 'telemetry', '2026-11-13'), 'usage');
  await writeFile(join(dataDir, 'ai', 'endpoint.json'), '{}');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const info = { version: '2.8.0-swh.30', createdAt: '2026-11-13T06:30:00.000Z' };
const read = (...p: string[]) => readFile(join(...p), 'utf8');

describe('appDataBackup', () => {
  it('writes the projects, widget data and window state with a marker, without usage history or AI endpoint', async () => {
    const backup = createAppDataBackup();
    const target = join(root, 'backup');

    await backup.write(dataDir, target, info);

    expect((await readdir(target)).sort()).toEqual(['app', backupMarkerFile, 'widgets', 'window']);
    expect(await read(target, 'widgets', 'w1', 'note')).toBe('current note');
    await expect(backup.readInfo(target)).resolves.toEqual(info);
  });

  it('leaves out temporary save files of the running app', async () => {
    await writeFile(join(dataDir, 'widgets', 'w1', 'note.tmp'), 'half written');
    const target = join(root, 'backup');

    await createAppDataBackup().write(dataDir, target, info);

    expect(await readdir(join(target, 'widgets', 'w1'))).toEqual(['note']);
  });

  it('refuses to write into a folder that already exists', async () => {
    const target = join(root, 'backup');
    await mkdir(target);

    await expect(createAppDataBackup().write(dataDir, target, info)).rejects.toThrow();
  });

  it.each([
    ['no marker', null],
    ['another app\'s file', '{"kind":"Other","version":"1","createdAt":"x"}'],
    ['broken JSON', '{'],
  ])('does not take a folder with %s as a backup', async (_name, marker) => {
    const dir = join(root, 'x');
    await mkdir(dir);
    if (marker !== null) {
      await writeFile(join(dir, backupMarkerFile), marker);
    }

    await expect(createAppDataBackup().readInfo(dir)).resolves.toBeNull();
  });

  it('restores: replaces the backed-up entries, moves the current ones aside, keeps usage history and AI endpoint', async () => {
    const backup = createAppDataBackup();
    const target = join(root, 'backup');
    await backup.write(dataDir, target, info);
    await writeFile(join(target, 'app'), '{"v":"backup"}');
    await rm(join(target, 'window'));
    // Changed after the backup:
    await writeFile(join(dataDir, 'widgets', 'w1', 'note'), 'newer note');
    await mkdir(join(dataDir, 'shared'));
    const aside = join(root, 'aside');

    await backup.apply(dataDir, target, aside);

    expect(await read(dataDir, 'app')).toBe('{"v":"backup"}');
    expect(await read(dataDir, 'widgets', 'w1', 'note')).toBe('current note');
    expect((await readdir(dataDir)).sort()).toEqual(['ai', 'app', 'telemetry', 'widgets']);
    expect(await read(dataDir, 'telemetry', '2026-11-13')).toBe('usage');
    expect(await read(aside, 'app')).toBe('{"v":"current"}');
    expect(await read(aside, 'widgets', 'w1', 'note')).toBe('newer note');
    expect((await readdir(aside)).sort()).toEqual(['app', 'shared', 'widgets', 'window']);
  });

  it('puts the current data back when the restore fails part way', async () => {
    const backup = createAppDataBackup();
    const target = join(root, 'backup');
    await backup.write(dataDir, target, info);
    await writeFile(join(target, 'app'), '{"v":"backup"}');
    await mkdir(join(dataDir, 'shared'));
    const aside = join(root, 'aside');
    // 'app' is replaced first; then moving the current 'shared' aside fails, because the aside folder already holds a
    // non-empty 'shared'.
    await mkdir(join(aside, 'shared', 'blocker'), { recursive: true });

    await expect(backup.apply(dataDir, target, aside)).rejects.toThrow('The current data was kept.');

    expect(await read(dataDir, 'app')).toBe('{"v":"current"}');
    expect(await read(dataDir, 'widgets', 'w1', 'note')).toBe('current note');
    expect(await read(dataDir, 'window')).toBe('{"w":1}');
  });

  it('hands a pending restore over once', async () => {
    const backup = createAppDataBackup();
    const pending = join(root, 'restore-pending.json');

    await backup.setPending(pending, 'C:\\backups\\b1');

    await expect(backup.takePending(pending)).resolves.toBe('C:\\backups\\b1');
    await expect(backup.takePending(pending)).resolves.toBeNull();
  });
});
