import path from 'node:path';
import { Edit, Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('exposes match pattern aliases through fields and queries after an incremental edit', async () => {
  await Parser.init();
  const language = await Language.load(path.resolve(import.meta.dirname, '../../tree-sitter-python.wasm'));
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, '(as_pattern alias: (identifier) @alias)');
  const source = 'match value:\n    case [first, *rest] as whole:\n        pass\nafter = 1\n';
  const previous = parser.parse(source)!;
  try {
    expect(previous.rootNode.hasError).toBe(false);
    const pattern = previous.rootNode.descendantsOfType('as_pattern')[0]!;
    expect(pattern.childForFieldName('alias')?.text).toBe('whole');
    expect(query.captures(previous.rootNode).map(({ node }) => node.text)).toEqual(['whole']);
    const startIndex = source.indexOf('whole');
    const column = startIndex - source.indexOf('\n') - 1;
    previous.edit(
      new Edit({
        startIndex,
        oldEndIndex: startIndex + 5,
        newEndIndex: startIndex + 6,
        startPosition: { row: 1, column },
        oldEndPosition: { row: 1, column: column + 5 },
        newEndPosition: { row: 1, column: column + 6 },
      })
    );
    const updated = source.replace('whole', 'result');
    const incremental = parser.parse(updated, previous)!;
    const fresh = parser.parse(updated)!;
    try {
      expect(incremental.rootNode.hasError).toBe(false);
      expect(incremental.rootNode.toString()).toBe(fresh.rootNode.toString());
      const aliases = query
        .captures(incremental.rootNode)
        .map(({ node }) => [node.text, node.startIndex, node.endIndex]);
      expect(aliases).toEqual([['result', startIndex, startIndex + 6]]);
      expect(aliases).toEqual(
        query.captures(fresh.rootNode).map(({ node }) => [node.text, node.startIndex, node.endIndex])
      );
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
