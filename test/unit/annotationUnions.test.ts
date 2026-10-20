import path from 'node:path';
import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

await Parser.init();
const language = await Language.load(path.join(import.meta.dirname, '../../tree-sitter-python.wasm'));

test('represents every annotation union operand consistently regardless of order', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const annotation of [
      'str | int',
      'IO[bytes] | int | float',
      'IO[bytes] | int | List[int]',
      'str | list[float] | bool',
      'list[float] | str | bool',
      'pkg.First[int] | pkg.Second[str] | None',
    ]) {
      for (const source of [
        `def f(value: ${annotation}): pass`,
        `def f() -> ${annotation}: pass`,
        `value: ${annotation} = None`,
        `type Alias = ${annotation}`,
      ]) {
        const tree = parser.parse(`${source}\nafter = 1\n`)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const unions = tree.rootNode.descendantsOfType('union_type');
          expect(unions, source).toHaveLength(annotation.split(' | ').length - 1);
          for (const union of unions) {
            expect(
              union.namedChildren.map((node) => node.type),
              source
            ).toEqual(['type', 'type']);
          }
          expect(tree.rootNode.descendantsOfType('binary_operator'), source).toHaveLength(0);
          expect(tree.rootNode.descendantsOfType('subscript'), source).toHaveLength(0);
          expect(
            tree.rootNode.descendantsOfType('generic_type').map((node) => node.text),
            source
          ).toEqual(annotation.match(/(?:\w+\.)?\w+\[\w+\]/g) ?? []);
          expect(tree.rootNode.lastNamedChild?.text).toBe('after = 1');
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps union operators as value expressions outside annotation positions', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const source of ['result = first | second | third', 'def f(value=first | second): pass']) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        expect(tree.rootNode.descendantsOfType('union_type')).toHaveLength(0);
        expect(tree.rootNode.descendantsOfType('binary_operator').length).toBeGreaterThan(0);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});
