import path from 'node:path';
import { Edit, Language, Parser, Query, type Point } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

const invalidStatements = [
  'def function(value)\n:\n    return value',
  'class Example\n:\n    pass',
  'if enabled\n:\n    pass',
  'value = 1 +\n    2',
  'def function() # header comment\n:\n    pass',
];

const validStatements = [
  'def function(value):\n    return value',
  'def function(value)\\\n:\n    return value',
  'value = (1 +\n2)',
  'if enabled:\n    value = 1 + \\\n2\n    inside()\noutside()',
  'value = [\n    1, # item comment\n2,\n]',
  'value = {\n    "key":\n1,\n}',
  'value = (\n# inner comment\n1 +\n2\n)',
  '\n  # leading comment\n\ndef function():\n    # body comment\n\n    pass\n\n# trailing comment',
  'value = """first\nsecond"""',
  'value = "first\\\nsecond"',
  'value = f"{(1 +\n2)}"',
  'if enabled:\n    if nested:\n        value = (1 +\n2)\n    inside()\noutside()',
];

test('distinguishes physical newlines from joined logical lines without losing following statements', async () => {
  await Parser.init();
  const language = await Language.load(path.resolve(import.meta.dirname, '../../tree-sitter-python.wasm'));
  const parser = new Parser().setLanguage(language);
  try {
    for (const newline of ['\n', '\r\n', '\r']) {
      for (const [statements, hasError] of [
        [invalidStatements, true],
        [validStatements, false],
      ] as const) {
        for (const statement of statements) {
          const source = `${statement}\nafter()\n`.replaceAll('\n', newline);
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(hasError);
            expect(tree.rootNode.lastNamedChild?.text, source).toBe('after()');
            expect(tree.rootNode.lastNamedChild?.startPosition, source).toEqual({
              row: source.slice(0, source.lastIndexOf('after()')).split('\n').length - 1,
              column: source.lastIndexOf('after()') - source.lastIndexOf('\n', source.lastIndexOf('after()') - 1) - 1,
            });
          } finally {
            tree.delete();
          }
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('reports newline insertion and removal consistently through incremental edit and undo', async () => {
  await Parser.init();
  const language = await Language.load(path.resolve(import.meta.dirname, '../../tree-sitter-python.wasm'));
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, '(call function: (identifier) @call)\n(return_statement (identifier) @value)');
  try {
    for (const newline of ['\n', '\r\n', '\r']) {
      let source = 'def function(value):\n    return value\nafter()\n'.replaceAll('\n', newline);
      let tree = parser.parse(source)!;
      const startIndex = source.indexOf(':');
      try {
        for (const insertion of [true, false]) {
          const joinedEnd = newline.endsWith('\n')
            ? { row: 1, column: 0 }
            : { row: 0, column: startIndex + newline.length };
          tree.edit(
            new Edit({
              startIndex,
              oldEndIndex: startIndex + (insertion ? 0 : newline.length),
              newEndIndex: startIndex + (insertion ? newline.length : 0),
              startPosition: { row: 0, column: startIndex },
              oldEndPosition: insertion ? { row: 0, column: startIndex } : joinedEnd,
              newEndPosition: insertion ? joinedEnd : { row: 0, column: startIndex },
            })
          );
          source = insertion
            ? source.slice(0, startIndex) + newline + source.slice(startIndex)
            : source.slice(0, startIndex) + source.slice(startIndex + newline.length);
          const incremental = parser.parse(source, tree)!;
          tree.delete();
          tree = incremental;
          const fresh = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(insertion);
            expect(tree.rootNode.toString()).toBe(fresh.rootNode.toString());
            const captures = (root: typeof tree.rootNode): [string, string, number, number, Point, Point][] =>
              query
                .captures(root)
                .map(({ name, node }) => [
                  name,
                  node.text,
                  node.startIndex,
                  node.endIndex,
                  node.startPosition,
                  node.endPosition,
                ]);
            expect(captures(tree.rootNode)).toEqual(captures(fresh.rootNode));
            expect(tree.rootNode.lastNamedChild?.text).toBe('after()');
          } finally {
            fresh.delete();
          }
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
