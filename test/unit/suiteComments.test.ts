import path from 'node:path';

import { Edit, Language, Parser, type Point, type Tree } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

const headers = [
  'def f():',
  'class C:',
  'if enabled:',
  'for item in items:',
  'while enabled:',
  'with resource:',
  'try:',
];
const endings = ['\n', '\r\n', '\r'];

await Parser.init();
const language = await Language.load(path.resolve(import.meta.dirname, '../../tree-sitter-python.wasm'));

test('keeps leading and comment-only suite comments inside their block without consuming following statements', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const header of headers) {
      for (const ending of endings) {
        for (const body of ['    # note\n    pass', '    "doc"\n    # note\n    pass', '    # note']) {
          const suffix = header === 'try:' ? '\nexcept:\n    pass' : '';
          const source = `${header}\n${body}${suffix}\nafter()\n`.replaceAll('\n', ending);
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(false);
            const comment = tree.rootNode.descendantsOfType('comment')[0]!;
            expect(comment.parent?.type, source).toBe('block');
            expect(comment.startIndex).toBe(source.indexOf('# note'));
            expect(comment.endIndex).toBe(source.indexOf('# note') + '# note'.length);
            expect(tree.rootNode.lastNamedChild?.text, source).toBe('after()');
            expect(tree.rootNode.lastNamedChild?.startIndex).toBe(source.indexOf('after()'));
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

test('reassigns comments consistently when a suite body is inserted and undone', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const ending of endings) {
      const original = `def f():\n    # note\nafter()\n`.replaceAll('\n', ending);
      const startIndex = original.indexOf('after()');
      const addition = `    pass${ending}`;
      let source = original;
      let tree = parser.parse(source)!;
      try {
        for (const undo of [false, true]) {
          const removed = undo ? addition.length : 0;
          const inserted = undo ? '' : addition;
          const updated = source.slice(0, startIndex) + inserted + source.slice(startIndex + removed);
          tree.edit(
            new Edit({
              startIndex,
              oldEndIndex: startIndex + removed,
              newEndIndex: startIndex + inserted.length,
              startPosition: pointAt(source, startIndex),
              oldEndPosition: pointAt(source, startIndex + removed),
              newEndPosition: pointAt(updated, startIndex + inserted.length),
            })
          );
          const incremental = parser.parse(updated, tree)!;
          tree.delete();
          tree = incremental;
          source = updated;
          const fresh = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError).toBe(false);
            expect(snapshot(tree)).toEqual(snapshot(fresh));
            expect(tree.rootNode.descendantsOfType('comment')[0]?.parent?.type).toBe('block');
            expect(tree.rootNode.lastNamedChild?.text).toBe('after()');
          } finally {
            fresh.delete();
          }
        }
        expect(source).toBe(original);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

function snapshot(tree: Tree): unknown {
  return [
    tree.rootNode.toString(),
    tree.rootNode
      .descendantsOfType(['block', 'comment', 'function_definition', 'call'])
      .map((node) => [node.type, node.text, node.startIndex, node.endIndex, node.startPosition, node.endPosition]),
  ];
}

function pointAt(source: string, index: number): Point {
  const prefix = source.slice(0, index);
  return { row: prefix.split('\n').length - 1, column: index - prefix.lastIndexOf('\n') - 1 };
}
