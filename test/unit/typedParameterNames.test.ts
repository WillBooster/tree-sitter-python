import path from 'node:path';

import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('exposes typed parameter names separately from their annotations', async () => {
  await Parser.init();
  const language = await Language.load(path.join(import.meta.dirname, '../../tree-sitter-python.wasm'));
  const parser = new Parser().setLanguage(language);
  try {
    const tree = parser.parse('def process(item: Item, *args: str, **kwargs: bool): pass')!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      expect(
        tree.rootNode.descendantsOfType('typed_parameter').map((parameter) => {
          const name = parameter.childForFieldName('name');
          const annotation = parameter.childForFieldName('type');
          expect(name?.isNamed).toBe(true);
          expect(annotation?.isNamed).toBe(true);
          return [name?.text, annotation?.text];
        })
      ).toEqual([
        ['item', 'Item'],
        ['*args', 'str'],
        ['**kwargs', 'bool'],
      ]);
    } finally {
      tree.delete();
    }
  } finally {
    parser.delete();
  }
});
