import path from 'node:path';
import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('default and bound subscripts preserve expression syntax', async () => {
  await Parser.init();
  const parser = new Parser();
  parser.setLanguage(await Language.load(path.resolve(import.meta.dirname, '../../tree-sitter-python.wasm')));
  try {
    const valid = [
      'list[dict[str, int]]',
      'typing.List[int]',
      'list[int] | None',
      '(list[int] | None)',
      'int | str | None',
      'typing.Dict[str, typing.List[int | str]]',
      'list[int] | str if flag else bytes',
      'factory()[int] | str',
      'list[int] & str',
      'list[int] | str & bytes',
      'list[int] | str + bytes',
      'list[int] | str == bytes',
      'a[:]',
      'a[::]',
      'a[1:2:3]',
      'a[:2, 3:, ::-1]',
      'a[*Ts, int]',
      'a[x := int]',
      'a[int | str]',
      'a[(int, str)]',
      'a[lambda x: x]',
      'list[int] if flag else str',
      'list[int](x)',
    ];
    const invalid = [
      'list[a:b:c:d]',
      'list[a:::]',
      'list[dict[a:b:c:d]]',
      'list[*Ts: int]',
      'list[**P]',
      'list[T = int]',
      'list[]',
    ];
    for (const [values, hasError] of [
      [valid, false],
      [invalid, true],
    ] as const) {
      for (const value of values) {
        for (const source of [
          `class C[T = ${value}]: pass`,
          `def f[T: ${value} = int](): pass`,
          `type A[T = ${value}] = T`,
          ...(value.includes(' if ') || value.includes(' == ') ? [] : [`class C[*Ts = *${value}]: pass`]),
        ]) {
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(hasError);
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

test('retains contextual names in defaulted type parameters', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(
    await Language.load(path.resolve(import.meta.dirname, '../../tree-sitter-python.wasm'))
  );
  try {
    for (const name of ['lazy', 'type', 'match', 'print', 'exec']) {
      for (const parameter of [`${name} = int`, `*${name} = *tuple[int]`, `**${name} = [int]`]) {
        for (const source of [
          `class C[${parameter}]: pass`,
          `def f[${parameter}](): pass`,
          `type A[${parameter}] = int`,
        ]) {
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(false);
            const [declaration] = tree.rootNode.descendantsOfType('default_type_parameter');
            expect(declaration?.childForFieldName('name')?.text, source).toBe(name);
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
