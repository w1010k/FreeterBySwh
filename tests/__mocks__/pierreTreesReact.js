/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

// Manual mock for @pierre/trees/react. The real package is ESM-only and cannot
// be loaded by Jest, so widget tests run against this lightweight stand-in.
// `__getModel()` / `__resetModel()` let specs inspect and reset the model.
const React = require('react');

function createModel() {
  const m = {
    resetPaths: jest.fn(),
    add: jest.fn(),
    // Applies each add through `add`, as the real store does, so specs can
    // keep asserting on `add` calls.
    batch: jest.fn(ops => ops.forEach(op => op.type === 'add' && m.add(op.path))),
    getItem: jest.fn(() => null),
    getFocusedPath: jest.fn(() => null),
    subscribe: jest.fn(() => () => undefined),
    getFileTreeContainer: jest.fn(() => undefined),
  };
  return m;
}

let model = createModel();

const useFileTree = jest.fn(() => ({ model }));
const FileTree = jest.fn(() => React.createElement('div', { 'data-testid': 'file-tree' }));

module.exports = {
  useFileTree,
  FileTree,
  __getModel: () => model,
  __resetModel: () => { model = createModel(); },
};
