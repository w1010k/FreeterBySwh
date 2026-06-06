/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

// Only the pure helper is under test; stub the module-level electron/fs imports
// so importing the module doesn't require a real Electron/fs environment.
jest.mock('electron', () => ({
  app: { getPath: () => '', on: () => undefined },
  session: { defaultSession: { on: () => undefined } },
}), { virtual: true });
jest.mock('node:original-fs', () => ({ existsSync: () => false }), { virtual: true });

import { resolveUniqueSavePath } from '@/infra/downloads/downloadManager';

const sep = process.platform === 'win32' ? '\\' : '/';
const p = (...parts: string[]) => parts.join(sep);

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
