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
      const highlights = [...html.matchAll(/<span class='([^']+)'>(Ts|P|Us|Vs|keys)<\/span>/g)].map(
        ([, kind, name]) => [name, kind]
      );
      expect(highlights.slice(0, 8)).toEqual([
        ['Ts', 'type'],
        ['P', 'type'],
        ['Vs', 'type'],
        ['Vs', 'type'],
        ['Us', 'type'],
        ['Us', 'type'],
        ['Ts', 'type'],
        ['Us', 'type'],
      ]);
      expect(highlights.slice(8).map(([name]) => name)).toEqual(['Ts', 'P', 'Vs', 'keys']);
      expect(highlights.slice(8).map(([, kind]) => kind)).not.toContain('type');
    },
  }
);
