import path from 'node:path';
import { Edit, Language, Parser, Query, type Point } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

const invalidStatements = [
  'def function(value)\n:\n    return value',
  'class Example\n:\n    pass',
  'if enabled\n:\n    pass',
  'if enabled\n:\n    value = 1\nelse:\n    other()',
  'for item in values\n:\n    consume(item)\nelse:\n    other()',
  'while enabled\n:\n    value = 1\nelse:\n    other()',
  'def function():\n    if enabled\n    :\n        value = 1\n    else:\n        other()',
  'value = 1 +\n    2',
  'def function() # header comment\n:\n    pass',
  'value = 1 + \\\n\n2',
  'value = 1 + \\\n# comment\n2',
  'def function(value) \\\n\n:\n    pass',
  'if enabled:\n    value = 1 + \\\n\n    2',
  'from module \\\n\nimport first',
];

const validStatements = [
  'def function(value):\n    return value',
  'def function(value)\\\n:\n    return value',
  'value = (1 +\n2)',
  'from module import (\n    first,\n    second,\n)',
  'from module \\\nimport first',
  'def function():\n    \\\n    pass',
  'value = 1 \\\n\nother = 2',
  '\\\n\nvalue = 1',
  '\\\n# comment\nvalue = 1',
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

test('reads a blank-line prefix without repeatedly requesting its suffix', async () => {
  await Parser.init();
  const language = await Language.load(path.resolve(import.meta.dirname, '../../tree-sitter-python.wasm'));
  const parser = new Parser().setLanguage(language);
  const source = '\n'.repeat(4000) + 'after()\n';
  let charactersRead = 0;
  try {
    const tree = parser.parse((index) => {
      const chunk = source.slice(index, index + 256);
      charactersRead += chunk.length;
      return chunk || undefined;
    })!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      expect(tree.rootNode.firstNamedChild?.text).toBe('after()');
      expect(tree.rootNode.firstNamedChild?.startPosition).toEqual({ row: 4000, column: 0 });
      expect(charactersRead).toBeLessThan(source.length * 16);
    } finally {
      tree.delete();
    }
  } finally {
    parser.delete();
  }
});

test('preserves suite boundaries and continuation ranges through incremental edit and undo', async () => {
  await Parser.init();
  const language = await Language.load(path.resolve(import.meta.dirname, '../../tree-sitter-python.wasm'));
  const parser = new Parser().setLanguage(language);
  try {
    for (const newline of ['\n', '\r\n', '\r']) {
      for (const header of ['def function():', 'class Example:', 'try:']) {
        for (const bodyStart of [true, false]) {
          const suffix = header === 'try:' ? '\nexcept:\n    pass' : '';
          const declaration = `${header}\n    pass${suffix}`.replaceAll('\n', newline);
          let source = `before()${newline}${declaration}${newline}after()${newline}`;
          let tree = parser.parse(source)!;
          const startIndex = bodyStart
            ? source.indexOf(header) + header.length + newline.length
            : source.lastIndexOf('pass') + 4;
          const join = `\\${newline}`;
          const startPosition = {
            row: source.slice(0, startIndex).split('\n').length - 1,
            column: startIndex - source.lastIndexOf('\n', startIndex - 1) - 1,
          };
          const joinedEnd = newline.endsWith('\n')
            ? { row: startPosition.row + 1, column: 0 }
            : { row: startPosition.row, column: startPosition.column + join.length };
          try {
            for (const insertion of [true, false]) {
              tree.edit(
                new Edit({
                  startIndex,
                  oldEndIndex: startIndex + (insertion ? 0 : join.length),
                  newEndIndex: startIndex + (insertion ? join.length : 0),
                  startPosition,
                  oldEndPosition: insertion ? startPosition : joinedEnd,
                  newEndPosition: insertion ? joinedEnd : startPosition,
                })
              );
              source = insertion
                ? source.slice(0, startIndex) + join + source.slice(startIndex)
                : source.slice(0, startIndex) + source.slice(startIndex + join.length);
              const incremental = parser.parse(source, tree)!;
              tree.delete();
              tree = incremental;
              const fresh = parser.parse(source)!;
              try {
                expect(tree.rootNode.hasError, source).toBe(false);
                expect(tree.rootNode.toString()).toBe(fresh.rootNode.toString());
                const suite = tree.rootNode.namedChildren[1]!;
                expect(
                  suite.childForFieldName('body')?.namedChildren.map((node) => node.text),
                  source
                ).toEqual(['pass']);
                if (!bodyStart) expect(suite.text, source).toBe(declaration);
                const joins = tree.rootNode.descendantsOfType('line_continuation');
                expect(
                  joins.map((node) => [
                    node.text,
                    node.startIndex,
                    node.endIndex,
                    node.startPosition,
                    node.endPosition,
                  ]),
                  source
                ).toEqual(insertion ? [[join, startIndex, startIndex + join.length, startPosition, joinedEnd]] : []);
                expect(tree.rootNode.firstNamedChild?.text).toBe('before()');
                expect(tree.rootNode.lastNamedChild?.text).toBe('after()');
                expect(tree.rootNode.namedChildren).toHaveLength(insertion && !bodyStart ? 4 : 3);
              } finally {
                fresh.delete();
              }
            }
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
