/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

// Exercise the manager's real event wiring without launching Electron.
jest.mock('electron', () => {
  const { EventEmitter } = jest.requireActual<typeof import('node:events')>('node:events');
  return {
    app: Object.assign(new EventEmitter(), { getPath: () => '' }),
    session: { defaultSession: new EventEmitter() },
  };
}, { virtual: true });
jest.mock('node:original-fs', () => ({ existsSync: () => false }), { virtual: true });

import { createDownloadManager, resolveUniqueSavePath } from '@/infra/downloads/downloadManager';
import { app, session } from 'electron';
import { EventEmitter } from 'node:events';

const sep = process.platform === 'win32' ? '\\' : '/';
const p = (...parts: string[]) => parts.join(sep);

describe('DownloadManager', () => {
  beforeEach(() => {
    app.removeAllListeners();
    session.defaultSession.removeAllListeners();
  });

  const download = (filename = 'a.txt') => Object.assign(new EventEmitter(), {
    getFilename: () => filename,
    setSavePath: jest.fn(),
  });

  it('should reserve distinct paths for simultaneous downloads across sessions', () => {
    const manager = createDownloadManager();
    manager.setDownloadDir(p('C:', 'dl'));
    const otherSession = new EventEmitter();
    app.emit('session-created', otherSession);
    const first = download();
    const second = download();

    session.defaultSession.emit('will-download', {}, first);
    otherSession.emit('will-download', {}, second);

    expect(first.setSavePath).toHaveBeenCalledWith(p('C:', 'dl', 'a.txt'));
    expect(second.setSavePath).toHaveBeenCalledWith(p('C:', 'dl', 'a (1).txt'));
  });

  it.each(['completed', 'cancelled', 'interrupted'])('should release a reservation when a download is %s', state => {
    const manager = createDownloadManager();
    manager.setDownloadDir(p('C:', 'dl'));
    const first = download();
    const second = download();
    session.defaultSession.emit('will-download', {}, first);
    session.defaultSession.emit('will-download', {}, second);
    first.emit('done', {}, state);
    const third = download();
    session.defaultSession.emit('will-download', {}, third);

    // existsSync is false: the completed file may have been moved/deleted.
    expect(second.setSavePath).toHaveBeenCalledWith(p('C:', 'dl', 'a (1).txt'));
    expect(third.setSavePath).toHaveBeenCalledWith(p('C:', 'dl', 'a.txt'));
  });

  it('should release the path if setting it fails', () => {
    createDownloadManager().setDownloadDir(p('C:', 'dl'));
    const first = download();
    first.setSavePath.mockImplementation(() => { throw new Error('refused'); });
    session.defaultSession.emit('will-download', {}, first);
    const second = download();
    session.defaultSession.emit('will-download', {}, second);

    expect(second.setSavePath).toHaveBeenCalledWith(p('C:', 'dl', 'a.txt'));
  });

  it('should treat differently cased Windows paths as one reservation', () => {
    createDownloadManager().setDownloadDir(p('C:', 'dl'));
    const first = download('a.txt');
    const second = download('A.txt');
    session.defaultSession.emit('will-download', {}, first);
    session.defaultSession.emit('will-download', {}, second);

    expect(second.setSavePath).toHaveBeenCalledWith(p('C:', 'dl', process.platform === 'win32' ? 'A (1).txt' : 'A.txt'));
  });
});

describe('resolveUniqueSavePath()', () => {
  it('should use the plain path when nothing collides', () => {
    expect(resolveUniqueSavePath(p('C:', 'dl'), 'a.txt', () => false)).toBe(p('C:', 'dl', 'a.txt'));
  });

  it('should append " (n)" before the extension on collision, picking the first free n', () => {
    const taken = new Set([p('C:', 'dl', 'a.txt'), p('C:', 'dl', 'a (1).txt')]);
    expect(resolveUniqueSavePath(p('C:', 'dl'), 'a.txt', path => taken.has(path))).toBe(p('C:', 'dl', 'a (2).txt'));
  });

  it('should handle filenames without an extension', () => {
    const taken = new Set([p('C:', 'dl', 'README')]);
    expect(resolveUniqueSavePath(p('C:', 'dl'), 'README', path => taken.has(path))).toBe(p('C:', 'dl', 'README (1)'));
  });

  it('should only suffix the base name, keeping multi-dot extensions intact', () => {
    const taken = new Set([p('C:', 'dl', 'archive.tar.gz')]);
    // extname() treats only the last segment as the extension, matching browser behavior.
    expect(resolveUniqueSavePath(p('C:', 'dl'), 'archive.tar.gz', path => taken.has(path))).toBe(p('C:', 'dl', 'archive.tar (1).gz'));
  });
});
