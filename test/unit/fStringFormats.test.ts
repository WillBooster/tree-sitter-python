import path from 'node:path';

import { Edit, Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('incrementally distinguishes format alignment from a parenthesized assignment', async () => {
  await Parser.init();
  const parser = new Parser();
  parser.setLanguage(await Language.load(path.resolve(import.meta.dirname, '../../tree-sitter-python.wasm')));
  let source = 'f"{value:=10}"';
  let tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('format_specifier').map((node) => node.text)).toEqual([':=10']);
    expect(tree.rootNode.descendantsOfType('named_expression')).toHaveLength(0);
    for (const [start, removed, inserted] of [
      [3, 0, '('],
      [13, 0, ')'],
      [13, 1, ''],
      [3, 1, ''],
    ] as const) {
      tree.edit(
        new Edit({
          startIndex: start,
          oldEndIndex: start + removed,
          newEndIndex: start + inserted.length,
          startPosition: { row: 0, column: start },
          oldEndPosition: { row: 0, column: start + removed },
          newEndPosition: { row: 0, column: start + inserted.length },
        })
      );
      source = source.slice(0, start) + inserted + source.slice(start + removed);
      const updated = parser.parse(source, tree)!;
      tree.delete();
      tree = updated;
      const fresh = parser.parse(source)!;
      try {
        expect(tree.rootNode.toString(), source).toBe(fresh.rootNode.toString());
      } finally {
        fresh.delete();
      }
      if (inserted === ')') {
        expect(tree.rootNode.hasError).toBe(false);
        expect(tree.rootNode.descendantsOfType('named_expression').map((node) => node.text)).toEqual(['value:=10']);
        expect(tree.rootNode.descendantsOfType('format_specifier')).toHaveLength(0);
      }
    }
    expect(source).toBe('f"{value:=10}"');
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('format_specifier').map((node) => node.text)).toEqual([':=10']);
    expect(tree.rootNode.descendantsOfType('named_expression')).toHaveLength(0);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('preserves format-specifier whitespace and ranges after edits', async () => {
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
        const startIndex = source.indexOf(':') + 1;
        tree.edit(
          new Edit({
            startIndex,
            oldEndIndex: startIndex,
            newEndIndex: startIndex + 1,
            startPosition: { row: 0, column: startIndex },
            oldEndPosition: { row: 0, column: startIndex },
            newEndPosition: { row: 0, column: startIndex + 1 },
          })
        );
        const updated = source.slice(0, startIndex) + ' ' + source.slice(startIndex);
        const incremental = parser.parse(updated, tree)!;
        const fresh = parser.parse(updated)!;
        try {
          expect(incremental.rootNode.hasError, updated).toBe(false);
          expect(incremental.rootNode.toString()).toBe(fresh.rootNode.toString());
          expect(captures(incremental.rootNode)).toEqual(captures(fresh.rootNode));
          expect(captures(incremental.rootNode)).toEqual([
            [
              expected.slice(0, 1) + ' ' + expected.slice(1),
              source.indexOf(':'),
              source.indexOf(':') + expected.length + 1,
            ],
          ]);
        } finally {
          incremental.delete();
          fresh.delete();
        }
      } finally {
        tree.delete();
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});
