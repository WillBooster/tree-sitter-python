import fs from 'node:fs';
import path from 'node:path';

import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

await Parser.init();
const language = await Language.load(path.join(import.meta.dirname, '../../tree-sitter-python.wasm'));
const highlights = fs.readFileSync(path.join(import.meta.dirname, '../../queries/highlights.scm'), 'utf8');

test('exposes qualified generic operands as types while retaining module qualifiers and value expressions', () => {
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, highlights);
  try {
    for (const source of [
      'def f(value: typing.List[numpy.ndarray]): pass',
      'value: dict[str, numpy.ndarray] = {}',
      'value: Callable[[numpy.ndarray], numpy.ndarray] = None',
      'type Alias = tuple[numpy.ndarray]',
      'value: list[tuple[numpy.ndarray | None]] = None',
    ]) {
      const tree = parser.parse(`${source}\nclass Following: pass\n`)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const members = tree.rootNode.descendantsOfType('member_type').filter((node) => node.text === 'numpy.ndarray');
        expect(members.length, source).toBeGreaterThan(0);
        const captures = query.captures(tree.rootNode);
        for (const member of members) {
          const name = member.lastNamedChild!;
          expect(
            captures.some(({ name: kind, node }) => kind === 'type' && node.id === name.id),
            source
          ).toBe(true);
        }
        expect(
          captures.filter(({ name, node }) => name === 'type' && node.text === 'numpy'),
          source
        ).toHaveLength(0);
        expect(tree.rootNode.lastNamedChild?.text).toBe('class Following: pass');
      } finally {
        tree.delete();
      }
    }
    const sliced = parser.parse('value: list[numpy.ndarray:other] = None\nclass Following: pass\n')!;
    try {
      expect(sliced.rootNode.hasError).toBe(false);
      const typeNames = query
        .captures(sliced.rootNode)
        .filter(({ name }) => name === 'type')
        .map(({ node }) => node.text);
      expect(typeNames).toEqual(expect.arrayContaining(['list', 'other']));
      expect(sliced.rootNode.lastNamedChild?.text).toBe('class Following: pass');
    } finally {
      sliced.delete();
    }
    for (const source of ['value = table[numpy.ndarray]', 'def f(value=table[numpy.ndarray]): pass']) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(tree.rootNode.descendantsOfType('attribute').map((node) => node.text)).toContain('numpy.ndarray');
        expect(tree.rootNode.descendantsOfType('member_type')).toHaveLength(0);
        expect(query.captures(tree.rootNode).filter(({ name }) => name === 'type')).toHaveLength(0);
      } finally {
        tree.delete();
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});
