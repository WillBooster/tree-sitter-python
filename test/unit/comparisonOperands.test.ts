import fs from 'node:fs';
import path from 'node:path';

import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

import { generationInputMtime } from '../helpers/generationInputs.js';

const root = path.resolve(import.meta.dirname, '../..');
const wasmPath = path.join(root, 'tree-sitter-python.wasm');
const artifactTime = fs.statSync(wasmPath).mtimeMs;
const sourceTimes = ['grammar.js', 'src/scanner.c', 'src/parser.c', 'src/tree_sitter/parser.h'].map(
  (source) => fs.statSync(path.join(root, source)).mtimeMs
);
if (Math.max(generationInputMtime(root), ...sourceTimes) > artifactTime) {
  throw new Error('Parser artifact is stale; run bun run build/ci before testing comparison operands.');
}
await Parser.init();
const language = await Language.load(wasmPath);

test('exposes every chained comparison operand through public fields', () => {
  const parser = new Parser().setLanguage(language);
  const source = 'result = first < call(value) is not None\nafter = 1\n';
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const comparison = tree.rootNode.descendantsOfType('comparison_operator')[0]!;
    expect(comparison.childrenForFieldName('operands').map((node) => node.text)).toEqual([
      'first',
      'call(value)',
      'None',
    ]);
    expect(comparison.childrenForFieldName('operators').map((node) => node.text)).toEqual(['<', 'is not']);
  } finally {
    tree.delete();
    parser.delete();
  }
});
