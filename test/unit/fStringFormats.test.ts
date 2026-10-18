import path from 'node:path';
import { Edit, Language, Parser } from '@willbooster/web-tree-sitter';
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
