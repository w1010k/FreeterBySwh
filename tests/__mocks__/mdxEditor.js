/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

// Manual mock for @mdxeditor/editor. The real package is ESM-only (and needs
// a real contenteditable), so widget tests run against this stand-in.
// `__getInstances()` returns one record per mounted editor, in mount order:
// `props` holds the latest props (call `props.onChange` / `props.onError` to
// simulate the editor), and `setMarkdown` records calls made through the ref.
const React = require('react');

let instances = [];

const MDXEditor = React.forwardRef(function MDXEditor(props, ref) {
  const inst = React.useRef(null);
  if (inst.current === null) {
    inst.current = { props, setMarkdown: jest.fn() };
    instances.push(inst.current);
  }
  inst.current.props = props;
  React.useImperativeHandle(ref, () => ({
    setMarkdown: (value) => inst.current.setMarkdown(value),
    getMarkdown: () => inst.current.props.markdown,
    insertMarkdown: () => undefined,
    focus: () => undefined,
    getContentEditableHTML: () => '',
    getSelectionMarkdown: () => ''
  }), []);
  return React.createElement('div', { 'data-testid': 'mdx-editor', 'data-readonly': String(!!props.readOnly) }, props.markdown);
});

const plugin = () => ({});

module.exports = {
  MDXEditor,
  headingsPlugin: plugin,
  listsPlugin: plugin,
  quotePlugin: plugin,
  thematicBreakPlugin: plugin,
  linkPlugin: plugin,
  linkDialogPlugin: plugin,
  tablePlugin: plugin,
  imagePlugin: plugin,
  frontmatterPlugin: plugin,
  codeBlockPlugin: plugin,
  codeMirrorPlugin: plugin,
  markdownShortcutPlugin: plugin,
  __getInstances: () => instances,
  __reset: () => { instances = []; },
};
