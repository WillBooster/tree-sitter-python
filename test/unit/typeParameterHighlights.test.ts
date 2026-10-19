import fs from 'node:fs';
import path from 'node:path';
import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';
import { testCommand } from './run.js';

test('highlights defaulted type parameter names, bounds, and direct defaults as types', async () => {
  await Parser.init();
  const root = path.resolve(import.meta.dirname, '../..');
  const language = await Language.load(path.join(root, 'tree-sitter-python.wasm'));
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(language, fs.readFileSync(path.join(root, 'queries/highlights.scm'), 'utf8'));
  try {
    for (const source of [
      'class C[T, U: Bound = Default, *Ts = Pack, **P = Params]: pass',
      'def f[T, U: Bound = Default, *Ts = Pack, **P = Params](): pass',
      'type A[T, U: Bound = Default, *Ts = Pack, **P = Params] = tuple[T]',
    ]) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const types = query.captures(tree.rootNode).filter((capture) => capture.name === 'type');
        expect(types.map((capture) => capture.node.text)).toEqual(
          expect.arrayContaining(['T', 'U', 'Bound', 'Default', 'Ts', 'Pack', 'P', 'Params'])
        );
      } finally {
        tree.delete();
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});

testCommand(
  'renders nested default and bound type names with the type highlight',
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
    'test/fixtures/highlights/typeParameterDefaults.py',
  ],
  170_000,
  {
    check: (html) => {
      expect(html.match(/<span class='type'>(?:int|str)<\/span>/g)).toHaveLength(30);
      expect(html).not.toMatch(/<span class='variable'>(?:int|str)<\/span>/);
      expect(html).toContain("<span class='type'>Protocol</span>");
      expect(html).toContain("<span class='type'>List</span>");
      for (const name of ['Value', 'Box', 'Leaf']) {
        expect(html).toContain(`<span class='type'>${name}</span>`);
        expect(html).not.toContain(`<span class='variable'>${name}</span>`);
      }
      for (const name of ['typing', 'lazy', 'pkg', 'types', 'other', 'models']) {
        expect(html).toContain(`<span class='variable'>${name}</span>`);
        expect(html).not.toContain(`<span class='type'>${name}</span>`);
      }
    },
  }
);
