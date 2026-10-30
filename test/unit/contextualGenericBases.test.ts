import path from 'node:path';

import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

await Parser.init();
const language = await Language.load(path.join(import.meta.dirname, '../../tree-sitter-python.wasm'));

test('parses contextual names as generic bases only in annotations', () => {
  const parser = new Parser().setLanguage(language);
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
          expect(tree.rootNode.lastNamedChild?.text, source).toBe('class Following: pass');
        } finally {
          tree.delete();
        }
      }
      const tree = parser.parse(`value = ${name}[int]\ndef f(value=${name}[int]): pass\n`)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        expect(tree.rootNode.descendantsOfType('generic_type')).toHaveLength(0);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});
