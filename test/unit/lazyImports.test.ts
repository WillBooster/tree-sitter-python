import { expect } from 'vitest';

import { testCommand } from './run.js';

testCommand(
  'highlights lazy only as an import modifier',
  [
    'script/tree-sitter',
    'highlight',
    '-p',
    '.',
    '-H',
    '--layout',
    'fragment',
    '--style',
    'minimal',
    'test/fixtures/highlights/lazyImports.py',
  ],
  170_000,
  {
    check: (html) => {
      const classes = [...html.matchAll(/<span class='([^']+)'>lazy<\/span>/g)].map(([, capture]) => capture);
      expect(classes).toEqual(['keyword', 'keyword', 'variable', 'variable']);
    },
  }
);
