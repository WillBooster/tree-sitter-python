import path from 'node:path';

import { Language, Parser } from '@willbooster/web-tree-sitter';
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

test('preserves raw quote escapes and accepts physical endings only after odd backslashes', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(
    await Language.load(path.resolve(import.meta.dirname, '../../tree-sitter-python.wasm'))
  );
  try {
    for (const newline of ['\r', '\n', '\r\n']) {
      for (const prefix of ['r', 'rb', 'fr']) {
        for (const quote of ["'", '"']) {
          for (const triple of [false, true]) {
            const delimiter = quote.repeat(triple ? 3 : 1);
            for (const count of [1, 2, 3, 4]) {
              const content = 'ab' + '\\'.repeat(count) + newline + 'cd';
              const literal = `${prefix}${delimiter}${content}${delimiter}`;
              const source = `x = ${literal}${newline}after()${newline}`;
              const tree = parser.parse(source)!;
              try {
                const valid = triple || count % 2 === 1;
                expect(tree.rootNode.hasError, source).toBe(!valid);
                expect(
                  tree.rootNode.descendantsOfType('call').map((node) => node.text),
                  source
                ).toContain('after()');
                if (valid) {
                  const strings = tree.rootNode.descendantsOfType('string');
                  expect(
                    strings.map((node) => node.text),
                    source
                  ).toEqual([literal]);
                  expect(strings.map((node) => [node.startIndex, node.endIndex])).toEqual([[4, 4 + literal.length]]);
                  expect(tree.rootNode.descendantsOfType('string_content').map((node) => node.text)).toEqual([content]);
                }
              } finally {
                tree.delete();
              }
            }
            const escapedQuote = `ab\\${quote}cd`;
            const literal = `${prefix}${delimiter}${escapedQuote}${delimiter}`;
            const tree = parser.parse(`x = ${literal}${newline}after()${newline}`)!;
            try {
              expect(tree.rootNode.hasError).toBe(false);
              expect(tree.rootNode.descendantsOfType('string_content').map((node) => node.text)).toEqual([
                escapedQuote,
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
