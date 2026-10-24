import path from 'node:path';

import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('reads bracketed line comments without replaying input for each comment', async () => {
  await Parser.init();
  const language = await Language.load(path.resolve(import.meta.dirname, '../../tree-sitter-python.wasm'));
  const parser = new Parser().setLanguage(language);
  try {
    for (const newline of ['\n', '\r\n']) {
      const source = [
        'values = [',
        ...Array.from({ length: 1000 }, () => '    value, # item'),
        ']',
        'after()',
        '',
      ].join(newline);
      let charactersRead = 0;
      const tree = parser.parse((index) => {
        const chunk = source.slice(index, index + 256);
        charactersRead += chunk.length;
        return chunk || undefined;
      })!;
      const parseCharactersRead = charactersRead;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        const lists = tree.rootNode.descendantsOfType('list');
        expect(lists).toHaveLength(1);
        const list = lists[0]!;
        expect(list.descendantsOfType('identifier')).toHaveLength(1000);
        const comments = list.descendantsOfType('comment');
        expect(comments).toHaveLength(1000);
        expect(comments.every((comment) => comment.text === '# item')).toBe(true);
        expect(tree.rootNode.lastNamedChild?.text).toBe('after()');
        expect(parseCharactersRead).toBeLessThan(source.length * 8);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});
