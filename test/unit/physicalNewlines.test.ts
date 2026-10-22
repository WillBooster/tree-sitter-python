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
    for (const newline of ['\n', '\r\n']) {
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
              row: source.split('\n').length - 2,
              column: 0,
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
    let source = 'def function(value):\n    return value\nafter()\n';
    let tree = parser.parse(source)!;
    const startIndex = source.indexOf(':');
    try {
      for (const insertion of [true, false]) {
        const row = insertion ? 0 : 1;
        tree.edit(
          new Edit({
            startIndex,
            oldEndIndex: startIndex + (insertion ? 0 : 1),
            newEndIndex: startIndex + (insertion ? 1 : 0),
            startPosition: { row: 0, column: startIndex },
            oldEndPosition: { row, column: insertion ? startIndex : 0 },
            newEndPosition: { row: insertion ? 1 : 0, column: insertion ? 0 : startIndex },
          })
        );
        source = insertion
          ? source.slice(0, startIndex) + '\n' + source.slice(startIndex)
          : source.slice(0, startIndex) + source.slice(startIndex + 1);
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
  } finally {
    query.delete();
    parser.delete();
  }
});
