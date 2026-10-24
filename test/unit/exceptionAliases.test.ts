import path from 'node:path';

import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

await Parser.init();
const language = await Language.load(path.join(import.meta.dirname, '../../tree-sitter-python.wasm'));

test('exposes exception types and identifier aliases directly to field queries', () => {
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, '(except_clause value: (_) @exception alias: (identifier) @alias)');
  try {
    for (const keyword of ['except', 'except*']) {
      for (const exception of ['Error', '(First, Second)', 'First if flag else Second', 'factory()']) {
        for (const alias of ['caught', 'match', 'type', 'lazy', 'print']) {
          const source = `try:\n    pass\n${keyword} ${exception} as ${alias}:\n    use(${alias})\nafter = 1\n`;
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(false);
            const clause = tree.rootNode.descendantsOfType('except_clause')[0]!;
            expect(
              clause.childrenForFieldName('value').map((node) => node.text),
              source
            ).toEqual([exception]);
            expect(clause.childForFieldName('alias')?.text, source).toBe(alias);
            expect(
              query.captures(tree.rootNode).map(({ name, node }) => [name, node.text]),
              source
            ).toEqual([
              ['exception', exception],
              ['alias', alias],
            ]);
            expect(tree.rootNode.lastNamedChild?.text).toBe('after = 1');
          } finally {
            tree.delete();
          }
        }
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});

test('preserves multiple exception types without aliases and with-item bindings', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const keyword of ['except', 'except*']) {
      const tree = parser.parse(`try:\n    pass\n${keyword} First, Second:\n    pass\n`)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        const clause = tree.rootNode.descendantsOfType('except_clause')[0]!;
        expect(clause.childrenForFieldName('value').map((node) => node.text)).toEqual(['First', 'Second']);
        expect(clause.childForFieldName('alias')).toBeNull();
      } finally {
        tree.delete();
      }
    }
    for (const binding of ['bound', 'obj.bound', 'items[0]', '(first, second)']) {
      const tree = parser.parse(`with first if flag else second as ${binding}:\n    pass\nafter = 1\n`)!;
      try {
        expect(tree.rootNode.hasError, binding).toBe(false);
        const item = tree.rootNode.descendantsOfType('with_item')[0]!;
        const pattern = item.childForFieldName('value')!;
        expect(pattern.type).toBe('as_pattern');
        expect(pattern.firstNamedChild?.type).toBe('conditional_expression');
        expect(pattern.childForFieldName('alias')?.text).toBe(binding);
        expect(tree.rootNode.lastNamedChild?.text).toBe('after = 1');
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('rejects non-identifier exception aliases and aliases after unparenthesized exception lists', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const clause of [
      'Error as obj.caught',
      'Error as (caught)',
      'Error as first, second',
      'First, Second as caught',
    ]) {
      for (const keyword of ['except', 'except*']) {
        const source = `try:\n    pass\n${keyword} ${clause}:\n    pass\n`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(true);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});
