import path from 'node:path';

import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('queries typed parameter names separately from their annotations', async () => {
  await Parser.init();
  const language = await Language.load(path.join(import.meta.dirname, '../../tree-sitter-python.wasm'));
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, '(typed_parameter name: (_) @name type: (_) @annotation)');
  try {
    const tree = parser.parse('def process(item: Item, *args: str, **kwargs: bool): pass')!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      expect(query.matches(tree.rootNode).map(({ captures }) => captures.map(({ node }) => node.text))).toEqual([
        ['item', 'Item'],
        ['*args', 'str'],
        ['**kwargs', 'bool'],
      ]);
    } finally {
      tree.delete();
    }
  } finally {
    query.delete();
    parser.delete();
  }
});
