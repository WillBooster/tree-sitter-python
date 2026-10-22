import path from 'node:path';
import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

const literals = [
  ['"a\\\nb"', true],
  ["'a\\\nb'", true],
  ['b"a\\\nb"', true],
  ['f"a\\\nb"', true],
  ['"""a\\\nb"""', true],
  ['r"a\\\nb"', false],
  ['rb"a\\\nb"', false],
] as const;

test('keeps string continuation nodes consistent across physical line endings', async () => {
  await Parser.init();
  const language = await Language.load(path.resolve(import.meta.dirname, '../../tree-sitter-python.wasm'));
  const parser = new Parser().setLanguage(language);
  try {
    for (const [literal, escaped] of literals) {
      let expectedTree: string | undefined;
      for (const newline of ['\n', '\r\n', '\r']) {
        const source = `${literal}\nafter()\n`.replaceAll('\n', newline);
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expectedTree ??= tree.rootNode.toString();
          expect(tree.rootNode.toString(), source).toBe(expectedTree);
          const escapes = tree.rootNode.descendantsOfType('escape_sequence');
          expect(
            escapes.map((node) => node.text),
            source
          ).toEqual(escaped ? [`\\${newline}`] : []);
          expect(tree.rootNode.descendantsOfType('line_continuation'), source).toHaveLength(0);
          expect(tree.rootNode.lastNamedChild?.text).toBe('after()');
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});
