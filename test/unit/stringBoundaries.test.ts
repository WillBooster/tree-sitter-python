import path from 'node:path';
import { Edit, Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('rejects physical endings in single-line literals without swallowing following calls', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(
    await Language.load(path.resolve(import.meta.dirname, '../../tree-sitter-python.wasm'))
  );
  try {
    for (const newline of ['\r', '\n', '\r\n']) {
      for (const prefix of ['', 'b', 'f', 'r', 'rb', 'fr']) {
        for (const quote of ["'", '"']) {
          for (const content of ['', 'abc', String.raw`\n`]) {
            const source = `x = ${prefix}${quote}${content}${newline}after()${newline}y = ${quote}q${quote}${newline}`;
            const tree = parser.parse(source)!;
            try {
              expect(tree.rootNode.hasError, source).toBe(true);
              const calls = tree.rootNode.descendantsOfType('call');
              expect(
                calls.some((call) => call.text === 'after()'),
                source
              ).toBe(true);
              expect(
                tree.rootNode.descendantsOfType('string_content').some((node) => node.text.includes('after()')),
                source
              ).toBe(false);
            } finally {
              tree.delete();
            }
          }
        }
      }
      for (const prefix of ['f', 'fr']) {
        for (const quote of ["'", '"']) {
          for (const payload of ['', 'width', String.raw`\\`]) {
            const source = `x = ${prefix}${quote}{value:${payload}${newline}width}${quote}${newline}after()${newline}`;
            const tree = parser.parse(source)!;
            try {
              expect(tree.rootNode.hasError, source).toBe(true);
              expect(tree.rootNode.lastNamedChild?.text, source).toBe('after()');
            } finally {
              tree.delete();
            }
          }
          for (const payload of [`width\\${newline}more`, `\\${newline}`]) {
            const source = `x = ${prefix}${quote}{value:${payload}}${quote}${newline}after()${newline}`;
            const tree = parser.parse(source)!;
            try {
              expect(tree.rootNode.hasError, source).toBe(false);
              expect(tree.rootNode.descendantsOfType('format_specifier').map((node) => node.text)).toEqual([
                `:${payload}`,
              ]);
              expect(tree.rootNode.lastNamedChild?.text).toBe('after()');
            } finally {
              tree.delete();
            }
          }
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('reparses inserted and undone string endings with fresh-parser ranges', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(
    await Language.load(path.resolve(import.meta.dirname, '../../tree-sitter-python.wasm'))
  );
  const capture = (
    tree: NonNullable<ReturnType<typeof parser.parse>>
  ): {
    error: boolean;
    tree: string;
    nodes: unknown[];
  } => ({
    error: tree.rootNode.hasError,
    tree: tree.rootNode.toString(),
    nodes: tree.rootNode
      .descendantsOfType(['string', 'format_specifier', 'call'])
      .map((node) => [node.type, node.text, node.startIndex, node.endIndex, node.startPosition, node.endPosition]),
  });
  try {
    for (const newline of ['\r', '\n', '\r\n']) {
      for (const literal of ['"ab"', 'r"ab"', 'f"{value:ab}"', 'f"""{value:ab}"""']) {
        for (const escaped of [false, true]) {
          const original = `x = ${literal}${newline}after()${newline}`;
          const startIndex = original.indexOf('ab') + 1;
          const inserted = (escaped ? '\\' : '') + newline;
          let source = original;
          let tree = parser.parse(source)!;
          try {
            for (const undo of [false, true]) {
              const removed = undo ? inserted.length : 0;
              const added = undo ? '' : inserted;
              const updated = source.slice(0, startIndex) + added + source.slice(startIndex + removed);
              tree.edit(
                new Edit({
                  startIndex,
                  oldEndIndex: startIndex + removed,
                  newEndIndex: startIndex + added.length,
                  startPosition: pointAt(source, startIndex),
                  oldEndPosition: pointAt(source, startIndex + removed),
                  newEndPosition: pointAt(updated, startIndex + added.length),
                })
              );
              const incremental = parser.parse(updated, tree)!;
              tree.delete();
              tree = incremental;
              source = updated;
              const fresh = parser.parse(source)!;
              try {
                expect(capture(tree), source).toEqual(capture(fresh));
                expect(tree.rootNode.hasError, source).toBe(!undo && !escaped && !literal.includes('"""'));
                expect(
                  tree.rootNode.descendantsOfType('call').map((node) => node.text),
                  source
                ).toContain('after()');
              } finally {
                fresh.delete();
              }
            }
            expect(source).toBe(original);
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

function pointAt(source: string, index: number): { row: number; column: number } {
  const prefix = source.slice(0, index);
  return { row: prefix.split('\n').length - 1, column: index - prefix.lastIndexOf('\n') - 1 };
}
