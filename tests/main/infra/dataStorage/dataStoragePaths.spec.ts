/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { join, resolve } from 'node:path';
import { sharedDataStoragePath, widgetDataStoragePath } from '@/infra/dataStorage/dataStoragePaths';
import { sharedStorageId } from '@common/base/sharedStorageId';

const appDataDir = resolve('/data/freeter-data');

describe('widgetDataStoragePath()', () => {
  it('puts a widget id under widgets/', () => {
    expect(widgetDataStoragePath(appDataDir, '0b7e1c2a-5f0d-4c8e-9a3b-1d2e3f4a5b6c'))
      .toBe(join(appDataDir, 'widgets', '0b7e1c2a-5f0d-4c8e-9a3b-1d2e3f4a5b6c'));
  });

  it.each([
    ['an empty id (the widgets folder itself)', ''],
    ['.', '.'],
    ['..', '..'],
    ['a path out of the data folder', '../../outside'],
    ['a path into another storage', '../shared/note'],
    ['a nested path under another widget', 'x/y'],
    ['a path that goes in and back out', 'x/../y'],
  ])('refuses %s', (_name, id) => {
    expect(() => widgetDataStoragePath(appDataDir, id)).toThrow('Invalid widget id');
  });
});

describe('sharedDataStoragePath()', () => {
  it('puts a key under shared/<widgetType>/', () => {
    expect(sharedDataStoragePath(appDataDir, sharedStorageId('to-do-list', 'app')))
      .toBe(join(appDataDir, 'shared', 'to-do-list', 'app'));
  });

  it.each([
    ['an empty key (the type folder itself)', sharedStorageId('note', ''), 'Invalid shared data key'],
    ['an id without a key', 'note', 'Invalid shared data key'],
    ['a key out of its type folder', sharedStorageId('note', '../to-do-list'), 'Invalid shared data key'],
    ['a key out of the data folder', sharedStorageId('note', '../../../outside'), 'Invalid shared data key'],
    ['an empty widget type', sharedStorageId('', 'k'), 'Invalid widget type'],
    ['a widget type out of shared/', sharedStorageId('..', 'widgets'), 'Invalid widget type'],
    ['a widget type reaching another type', sharedStorageId('note/../to-do-list', 'app'), 'Invalid widget type'],
    ['a key with a separator', sharedStorageId('note', 'a/b'), 'Invalid shared data key'],
  ])('refuses %s', (_name, id, message) => {
    expect(() => sharedDataStoragePath(appDataDir, id)).toThrow(message);
  });
});
