import path from 'node:path';

import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('distinguishes format alignment from an assignment expression', async () => {
  await Parser.init();
  const parser = new Parser();
  parser.setLanguage(await Language.load(path.resolve(import.meta.dirname, '../../tree-sitter-python.wasm')));
  const tree = parser.parse('f"{value:=10}"')!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('format_specifier').map((node) => node.text)).toEqual([':=10']);
    expect(tree.rootNode.descendantsOfType('named_expression')).toHaveLength(0);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('preserves format-specifier whitespace and ranges', async () => {
  await Parser.init();
  const language = await Language.load(path.resolve(import.meta.dirname, '../../tree-sitter-python.wasm'));
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, '(format_specifier) @format');
  try {
    for (const payload of [' ', '   ', '\t', ' {2}', '{2} ', '\r\n', '\n ', '\r\n\t']) {
      const source = `x = f"""{1:${payload}}"""\n`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const captures = (root: typeof tree.rootNode): [string, number, number][] =>
          query.captures(root).map(({ node }) => [node.text, node.startIndex, node.endIndex]);
        const endIndex = source.lastIndexOf('}');
        const expected = source.slice(source.indexOf(':'), endIndex).replace(/\n$/, '');
        expect(captures(tree.rootNode)).toEqual([
          [expected, source.indexOf(':'), source.indexOf(':') + expected.length],
        ]);
      } finally {
        tree.delete();
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});
