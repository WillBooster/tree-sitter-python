import path from 'node:path';

import { Language, Parser, type Point } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

const extras = ['\uFEFF', '\u2060', '\u200B', '\uFEFF\u2060\u200B'];
const endings = ['\n', '\r\n', '\r'];

test('preserves declared layout extras across blank lines, comments and suite joins', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(
    await Language.load(path.resolve(import.meta.dirname, '../../tree-sitter-python.wasm'))
  );
  try {
    for (const extra of extras) {
      for (const ending of endings) {
        for (const input of [
          `before()\n${extra}\nafter()\n`,
          `before()\n${extra}# note\nafter()\n`,
          `def f():\n    first()\n${extra}\n${extra}    second()\nafter()\n`,
          `def f():\n    first()\n${extra}# note\n${extra}    second()\nafter()\n`,
          `value = [\n${extra}# note\n${extra}    1,\n${extra}\n]\nafter()\n`,
          `value = 1 ${extra}\\\n    + 2\nafter()\n`,
          `def f():\n${extra}\\\n${extra}    first()\nafter()\n`,
          `before()\n \t${extra}\f \n \t${extra}# note\nafter()\n`,
        ]) {
          const source = input.replaceAll('\n', ending);
          const reference = parser.parse(source.replaceAll(/[\uFEFF\u2060\u200B]/g, ''))!;
          const tree = parser.parse(source)!;
          try {
            expect(reference.rootNode.hasError).toBe(false);
            expect(tree.rootNode.hasError, source).toBe(false);
            expect(tree.rootNode.toString(), source).toBe(reference.rootNode.toString());
            for (const node of tree.rootNode.descendantsOfType(['comment', 'line_continuation', 'call'])) {
              const start = source.indexOf(node.text);
              expect(node.startIndex, source).toBe(start);
              expect(node.endIndex, source).toBe(start + node.text.length);
              expect(node.startPosition).toEqual(pointAt(source, start));
              expect(node.endPosition).toEqual(pointAt(source, start + node.text.length));
            }
            const declaration = tree.rootNode.descendantsOfType('function_definition')[0];
            if (declaration) {
              const lastBodyCall = source.includes('second()') ? 'second()' : 'first()';
              expect(declaration.endIndex).toBe(source.indexOf(lastBodyCall) + lastBodyCall.length);
            }
            expect(tree.rootNode.lastNamedChild?.text).toBe('after()');
          } finally {
            tree.delete();
            reference.delete();
          }
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('does not turn unjoined physical endings into continuations or strip literal content', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(
    await Language.load(path.resolve(import.meta.dirname, '../../tree-sitter-python.wasm'))
  );
  try {
    for (const extra of extras) {
      for (const ending of endings) {
        for (const input of [
          `value = 1 + ${extra}\n2\nafter()\n`,
          `def f(value) ${extra}\n:\n    pass\nafter()\n`,
          `value = 1 + \\${extra}\n2\nafter()\n`,
        ]) {
          const source = input.replaceAll('\n', ending);
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(true);
            expect(tree.rootNode.descendantsOfType('call').map((node) => node.text)).toContain('after()');
          } finally {
            tree.delete();
          }
        }
        const source = `value = "${extra}"${ending}formatted = f"{value:${extra}}"${ending}# note ${extra}${ending}after()${ending}`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError).toBe(false);
          expect(tree.rootNode.descendantsOfType('string_content').map((node) => node.text)).toEqual([extra]);
          expect(tree.rootNode.descendantsOfType('format_specifier').map((node) => node.text)).toEqual([`:${extra}`]);
          expect(tree.rootNode.descendantsOfType('comment').map((node) => node.text)).toEqual([`# note ${extra}`]);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

function pointAt(source: string, index: number): Point {
  const prefix = source.slice(0, index);
  return { row: prefix.split('\n').length - 1, column: index - prefix.lastIndexOf('\n') - 1 };
}
