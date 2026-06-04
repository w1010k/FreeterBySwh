import base from '../../eslint.config.mjs';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  ...base,
  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat['jsx-runtime'],
  reactHooks.configs.flat.recommended,
  {
    languageOptions: {
      globals: {
        browser: 'readonly'
      }
    },
    settings: {
      react: {
        createClass: 'createReactClass',
        pragma: 'React',
        version: 'detect'
      },
      linkComponents: [
        'Hyperlink',
        { 'name': 'Link', 'linkAttribute': 'to' }
      ]
    }
  },
  {
    rules: {
      // eslint-plugin-react-hooks@7 greatly expanded its `recommended` preset.
      // These two newly-enabled rules flag intentional patterns in fork widgets
      // (note live-sync via refs, dynamic-icon reset). Downgraded to warnings so
      // the upstream-2.8 merge isn't blocked; revisit and address properly later.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn'
    }
  }
];
