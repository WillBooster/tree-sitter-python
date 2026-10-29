import fs from 'node:fs';
import path from 'node:path';

import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

await Parser.init();
const language = await Language.load(path.join(import.meta.dirname, '../../tree-sitter-python.wasm'));
const highlights = fs.readFileSync(path.join(import.meta.dirname, '../../queries/highlights.scm'), 'utf8');

test('classifies contextual names and their generic operands as types only in annotations', () => {
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, highlights);
  try {
    for (const name of ['match', 'print', 'exec', 'lazy']) {
      for (const annotation of [
        `value: ${name}[int] = None`,
        `def f(value: ${name}[int]): pass`,
        `def f() -> ${name}[int]: pass`,
        `type Alias = ${name}[int]`,
        `def f[${name}: ${name}[int]](): pass`,
      ]) {
        const source = `${annotation}\nclass Following: pass\n`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const base = tree.rootNode.descendantsOfType('generic_type').find((node) => node.text === `${name}[int]`);
          expect(base?.firstNamedChild?.text, source).toBe(name);
          const captures = query.captures(tree.rootNode).filter(({ name: role }) => role === 'type');
          const baseStart = source.indexOf(`${name}[int]`);
          for (const [spelling, start] of [
            [name, baseStart],
            ['int', baseStart + name.length + 1],
          ] as const) {
            expect(
              captures.some(({ node }) => node.startIndex === start && node.text === spelling),
              source
            ).toBe(true);
          }
          expect(tree.rootNode.lastNamedChild?.text, source).toBe('class Following: pass');
        } finally {
          tree.delete();
        }
      }
      const tree = parser.parse(`value = ${name}[int]\ndef f(value=${name}[int]): pass\n`)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        expect(tree.rootNode.descendantsOfType('generic_type')).toHaveLength(0);
        expect(query.captures(tree.rootNode).filter(({ name: role }) => role === 'type')).toHaveLength(0);
      } finally {
        tree.delete();
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});
