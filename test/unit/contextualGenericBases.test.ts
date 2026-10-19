import fs from 'node:fs';
import path from 'node:path';
import { Edit, Language, Parser, Query } from '@willbooster/web-tree-sitter';
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

test('incrementally changes a generic base to match while retaining the following match statement', () => {
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, highlights);
  const source = 'value: Normal[int] = None\nmatch subject:\n    case _:\n        pass\nclass Following: pass\n';
  const previous = parser.parse(source)!;
  try {
    const startIndex = source.indexOf('Normal');
    previous.edit(
      new Edit({
        startIndex,
        oldEndIndex: startIndex + 'Normal'.length,
        newEndIndex: startIndex + 'match'.length,
        startPosition: { row: 0, column: startIndex },
        oldEndPosition: { row: 0, column: startIndex + 'Normal'.length },
        newEndPosition: { row: 0, column: startIndex + 'match'.length },
      })
    );
    const updated = source.replace('Normal', 'match');
    const incremental = parser.parse(updated, previous)!;
    const fresh = parser.parse(updated)!;
    try {
      expect(incremental.rootNode.hasError).toBe(false);
      expect(incremental.rootNode.toString()).toBe(fresh.rootNode.toString());
      const captures = query.captures(incremental.rootNode);
      expect(
        captures.filter(({ name, node }) => name === 'type' && node.startIndex === startIndex && node.text === 'match')
      ).toHaveLength(1);
      expect(captures.filter(({ name, node }) => name === 'keyword' && node.text === 'match')).toHaveLength(1);
      expect(incremental.rootNode.descendantsOfType('match_statement')).toHaveLength(1);
      expect(incremental.rootNode.lastNamedChild?.text).toBe('class Following: pass');
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
