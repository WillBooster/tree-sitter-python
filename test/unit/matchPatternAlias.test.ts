import path from 'node:path';

import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('exposes match pattern aliases through fields and queries', async () => {
  await Parser.init();
  const language = await Language.load(path.resolve(import.meta.dirname, '../../tree-sitter-python.wasm'));
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, '(as_pattern alias: (identifier) @alias)');
  const source = 'match value:\n    case [first, *rest] as whole:\n        pass\nafter = 1\n';
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const pattern = tree.rootNode.descendantsOfType('as_pattern')[0]!;
    expect(pattern.childForFieldName('alias')?.text).toBe('whole');
    expect(query.captures(tree.rootNode).map(({ node }) => node.text)).toEqual(['whole']);
  } finally {
    tree.delete();
    query.delete();
    parser.delete();
  }
});
