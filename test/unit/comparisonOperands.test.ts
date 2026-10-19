import fs from 'node:fs';
import path from 'node:path';
import { Edit, Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const wasmPath = path.join(root, 'tree-sitter-python.wasm');
const artifactTime = fs.statSync(wasmPath).mtimeMs;
if (
  ['grammar.js', 'src/scanner.c', 'src/parser.c'].some(
    (source) => fs.statSync(path.join(root, source)).mtimeMs > artifactTime
  )
) {
  throw new Error('Parser artifact is stale; run bun run build/ci before testing comparison operands.');
}
await Parser.init();
const language = await Language.load(wasmPath);

test('exposes every chained comparison operand through public fields and queries after an edit', () => {
  const query = new Query(language, '(comparison_operator operands: (_) @operand)');
  const parser = new Parser().setLanguage(language);
  const source = 'result = first < call(value) is not None\nafter = 1\n';
  const previous = parser.parse(source)!;
  try {
    expect(previous.rootNode.hasError).toBe(false);
    const comparison = previous.rootNode.descendantsOfType('comparison_operator')[0]!;
    expect(comparison.childrenForFieldName('operands').map((node) => node.text)).toEqual([
      'first',
      'call(value)',
      'None',
    ]);
    expect(comparison.childrenForFieldName('operators').map((node) => node.text)).toEqual(['<', 'is not']);
    expect(query.captures(previous.rootNode).map(({ node }) => [node.text, node.startIndex, node.endIndex])).toEqual(
      comparison.childrenForFieldName('operands').map((node) => [node.text, node.startIndex, node.endIndex])
    );
    const startIndex = source.indexOf('\n');
    const insertion = ' not in values';
    previous.edit(
      new Edit({
        startIndex,
        oldEndIndex: startIndex,
        newEndIndex: startIndex + insertion.length,
        startPosition: { row: 0, column: startIndex },
        oldEndPosition: { row: 0, column: startIndex },
        newEndPosition: { row: 0, column: startIndex + insertion.length },
      })
    );
    const updated = source.slice(0, startIndex) + insertion + source.slice(startIndex);
    const incremental = parser.parse(updated, previous)!;
    const fresh = parser.parse(updated)!;
    try {
      expect(incremental.rootNode.hasError).toBe(false);
      expect(incremental.rootNode.toString()).toBe(fresh.rootNode.toString());
      const captures = query
        .captures(incremental.rootNode)
        .map(({ node }) => [node.text, node.startIndex, node.endIndex]);
      expect(captures).toEqual(
        query.captures(fresh.rootNode).map(({ node }) => [node.text, node.startIndex, node.endIndex])
      );
      expect(captures.map(([text]) => text)).toEqual(['first', 'call(value)', 'None', 'values']);
      expect(incremental.rootNode.lastNamedChild?.text).toBe('after = 1');
    } finally {
      incremental.delete();
      fresh.delete();
    }
  } finally {
    previous.delete();
    query.delete();
    parser.delete();
  }
});
