import path from 'node:path';
import { Edit, Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

import { testCommand } from './run.js';

// Edits each corpus case at random and reparses it incrementally, then undoes the edits and reparses
// again: the changed ranges must cover every change and the final tree must match the corpus. The CLI
// exits zero even when a case fails or no corpus is found, so its output decides: it must list the cases
// it fuzzed and print no failure summary. TREE_SITTER_SEED, TREE_SITTER_ITERATIONS,
// and TREE_SITTER_EDITS explore further locally.
testCommand('reparses the corpus consistently after random edits', ['script/fuzz-corpus'], 900_000, {
  env: {
    TREE_SITTER_SEED: process.env.TREE_SITTER_SEED ?? '1',
    TREE_SITTER_ITERATIONS: process.env.TREE_SITTER_ITERATIONS ?? '1000',
    TREE_SITTER_EDITS: process.env.TREE_SITTER_EDITS ?? '10',
  },
  check: (output) => {
    expect(output).toMatch(/^ +\d+\. .+ - corpus - /m);
    expect(output).not.toContain('failed fuzzing');
  },
});

test('keeps dedented continuation operands and following statements in their suite after edits', async () => {
  await Parser.init();
  const language = await Language.load(path.resolve(import.meta.dirname, '../../tree-sitter-python.wasm'));
  const parser = new Parser().setLanguage(language);
  const query = new Query(
    language,
    '(call function: (identifier) @call)\n(binary_operator right: (integer) @operand)\n(pair value: (integer) @operand)'
  );
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
      let source = `if enabled:\n${suiteIndent}result = ${expression}\n${suiteIndent}still_inside()\nafter()\n`;
      let tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        for (const indentation of ['', '  ']) {
          const startIndex = source.indexOf('\n', source.indexOf('result =')) + 1;
          const oldEndIndex = source.indexOf('2', startIndex);
          tree.edit(
            new Edit({
              startIndex,
              oldEndIndex,
              newEndIndex: startIndex + indentation.length,
              startPosition: { row: 2, column: 0 },
              oldEndPosition: { row: 2, column: oldEndIndex - startIndex },
              newEndPosition: { row: 2, column: indentation.length },
            })
          );
          source = source.slice(0, startIndex) + indentation + source.slice(oldEndIndex);
          const edited = parser.parse(source, tree)!;
          tree.delete();
          tree = edited;
          const fresh = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(false);
            expect(tree.rootNode.toString()).toBe(fresh.rootNode.toString());
            const suite = tree.rootNode.firstNamedChild?.childForFieldName('consequence');
            expect(suite?.namedChildCount).toBe(2);
            expect(suite?.lastNamedChild?.text).toBe('still_inside()');
            expect(tree.rootNode.namedChildCount).toBe(2);
            expect(tree.rootNode.lastNamedChild?.text).toBe('after()');
            const captures = query
              .captures(tree.rootNode)
              .map(({ name, node }) => [name, node.text, node.startIndex, node.endIndex]);
            expect(captures).toEqual(
              query.captures(fresh.rootNode).map(({ name, node }) => [name, node.text, node.startIndex, node.endIndex])
            );
            const operandIndex = startIndex + indentation.length;
            expect(captures.filter(([name]) => name === 'operand')).toEqual([
              ['operand', '2', operandIndex, operandIndex + 1],
            ]);
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

test('retains explicit line continuation nodes around brackets after edits', async () => {
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
          const captures = (root: typeof tree.rootNode): [string, number, number][] =>
            query.captures(root).map(({ node }) => [node.text, node.startIndex, node.endIndex]);
          const first = source.indexOf(continuation);
          const second = source.lastIndexOf(continuation);
          expect(captures(tree.rootNode)).toEqual([
            [continuation, first, first + continuation.length],
            [continuation, second, second + continuation.length],
          ]);
          const startIndex = source.indexOf('1');
          tree.edit(
            new Edit({
              startIndex,
              oldEndIndex: startIndex + 1,
              newEndIndex: startIndex + 2,
              startPosition: { row: 1, column: 1 },
              oldEndPosition: { row: 1, column: 2 },
              newEndPosition: { row: 1, column: 3 },
            })
          );
          const updated = source.slice(0, startIndex) + '11' + source.slice(startIndex + 1);
          const incremental = parser.parse(updated, tree)!;
          const fresh = parser.parse(updated)!;
          try {
            expect(incremental.rootNode.hasError, updated).toBe(false);
            expect(incremental.rootNode.toString()).toBe(fresh.rootNode.toString());
            expect(captures(incremental.rootNode)).toEqual(captures(fresh.rootNode));
            expect(captures(incremental.rootNode)).toEqual([
              [continuation, first, first + continuation.length],
              [continuation, second + 1, second + 1 + continuation.length],
            ]);
          } finally {
            incremental.delete();
            fresh.delete();
          }
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
