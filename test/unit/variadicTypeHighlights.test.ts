import { expect } from 'vitest';
import { testCommand } from './run.js';

testCommand(
  'renders variadic type parameter names as types',
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
    'test/fixtures/highlights/variadicTypes.py',
  ],
  170_000,
  {
    check: (html) => {
      const highlights = [...html.matchAll(/<span class='([^']+)'>(Ts|P|Us|Vs)<\/span>/g)].map(([, kind, name]) => [
        name,
        kind,
      ]);
      expect(highlights).toEqual([
        ['Ts', 'type'],
        ['P', 'type'],
        ['Vs', 'type'],
        ['Vs', 'type'],
        ['Us', 'type'],
        ['Us', 'type'],
        ['Ts', 'constructor'],
        ['P', 'constant'],
      ]);
    },
  }
);
