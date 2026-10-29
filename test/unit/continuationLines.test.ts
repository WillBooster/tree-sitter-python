import path from 'node:path';

import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('parses continuation operands in their suite', async () => {
  await Parser.init();
  const language = await Language.load(path.resolve(import.meta.dirname, '../../tree-sitter-python.wasm'));
  const parser = new Parser().setLanguage(language);
  try {
    const cases: [string, string][] = [
      'call(1 +\n  2)',
      '(1 +\n  2)',
      'items[1 +\n  2]',
      '[1 +\n  2]',
      '{1 +\n  2}',
      '{1:\n  2}',
      '('.repeat(129) + '1 +\n  2' + ')'.repeat(129),
    ].map((expression) => ['  ', expression]);
    for (const width of [252, 253, 768, 769]) {
      cases.push([' '.repeat(width), 'call(1 +\n  2)']);
    }
    for (const [suiteIndent, expression] of cases) {
      const source = `if enabled:\n${suiteIndent}result = ${expression}\n${suiteIndent}still_inside()\nafter()\n`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('recovers unbracketed incomplete expressions without capturing the following statement', async () => {
  await Parser.init();
  const language = await Language.load(path.resolve(import.meta.dirname, '../../tree-sitter-python.wasm'));
  const parser = new Parser().setLanguage(language);
  try {
    for (const source of ['if enabled:\n  result = 1 +\n2\nafter()\n', 'if enabled:\n  result =\nafter()\n']) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(true);
        expect(tree.rootNode.lastNamedChild?.type).toBe('expression_statement');
        expect(tree.rootNode.lastNamedChild?.text).toBe('after()');
        expect(tree.rootNode.lastNamedChild?.startPosition).toEqual({ row: source.split('\n').length - 2, column: 0 });
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('retains explicit line continuation nodes around brackets', async () => {
  await Parser.init();
  const language = await Language.load(path.resolve(import.meta.dirname, '../../tree-sitter-python.wasm'));
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, '(line_continuation) @continuation');
  try {
    for (const expression of ['(1)', '[1]', '{1}', '{1: 2}']) {
      for (const newline of ['\n', '\r\n']) {
        const continuation = String.fromCodePoint(92) + newline;
        const source = `x = ${continuation}${expression.slice(0, -1)} ${continuation}${expression.slice(-1)}${newline}`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const first = source.indexOf(continuation);
          const second = source.lastIndexOf(continuation);
          expect(query.captures(tree.rootNode).map(({ node }) => [node.text, node.startIndex, node.endIndex])).toEqual([
            [continuation, first, first + continuation.length],
            [continuation, second, second + continuation.length],
          ]);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});
