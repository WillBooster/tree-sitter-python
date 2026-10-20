import fs from 'node:fs';
import path from 'node:path';
import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
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

test('keeps generic receivers and repeated subscripts as types through member and union boundaries', () => {
  const parser = new Parser().setLanguage(language);
  const query = new Query(
    language,
    fs.readFileSync(path.join(import.meta.dirname, '../../queries/highlights.scm'), 'utf8')
  );
  try {
    for (const annotation of [
      'Outer[int].Inner',
      'Outer[int].Inner[str].Leaf',
      'a | b[c].d',
      'b[c].d | a',
      'a[b][c] | d',
      'd | a[b][c]',
    ]) {
      const tree = parser.parse(`value: ${annotation} = None\nafter = 1\n`)!;
      try {
        expect(tree.rootNode.hasError, annotation).toBe(false);
        expect(tree.rootNode.descendantsOfType('attribute'), annotation).toHaveLength(0);
        expect(tree.rootNode.descendantsOfType('subscript'), annotation).toHaveLength(0);
        expect(tree.rootNode.descendantsOfType('binary_operator'), annotation).toHaveLength(0);
        expect(tree.rootNode.descendantsOfType('union_type'), annotation).toHaveLength(
          annotation.split(' | ').length - 1
        );
        const captured = query
          .captures(tree.rootNode)
          .filter(({ name }) => name === 'type')
          .map(({ node }) => node.text);
        expect(captured, annotation).toEqual(expect.arrayContaining(annotation.match(/\w+/g)!));
        expect(tree.rootNode.lastNamedChild?.text).toBe('after = 1');
      } finally {
        tree.delete();
      }
      const valueTree = parser.parse(`result = ${annotation}`)!;
      try {
        expect(valueTree.rootNode.hasError).toBe(false);
        expect(valueTree.rootNode.descendantsOfType(['generic_type', 'member_type', 'union_type'])).toHaveLength(0);
        expect(query.captures(valueTree.rootNode).filter(({ name }) => name === 'type')).toHaveLength(0);
      } finally {
        valueTree.delete();
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});
