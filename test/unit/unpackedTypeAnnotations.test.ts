import fs from 'node:fs';
import path from 'node:path';

import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

import { testCommand } from './run.js';

await Parser.init();
const language = await Language.load(path.join(import.meta.dirname, '../../tree-sitter-python.wasm'));
const highlights = fs.readFileSync(path.join(import.meta.dirname, '../../queries/highlights.scm'), 'utf8');

testCommand(
  'renders qualified and composite unpacked annotations as types without coloring value unpacks',
  [
    'script/tree-sitter',
    'highlight',
    '-p',
    '.',
    '-H',
    '--layout',
    'fragment',
    '--style',
    'minimal',
    'test/fixtures/highlights/unpackedTypeAnnotations.py',
  ],
  170_000,
  {
    check: (html) => {
      const captures = [...html.matchAll(/<span class='([^']+)'>(Qa|Qb|Qc|Ta|Tb|Ua|Ub|Va|Vb)<\/span>/g)].map(
        ([, kind, name]) => [name, kind]
      );
      expect(captures.slice(0, 7)).toEqual([
        ['Qa', 'type'],
        ['Qb', 'type'],
        ['Ta', 'type'],
        ['Tb', 'type'],
        ['Ua', 'type'],
        ['Ub', 'type'],
        ['Qc', 'type'],
      ]);
      expect(captures.slice(7).map(([name]) => name)).toEqual(['Va', 'Vb']);
      expect(captures.slice(7).map(([, kind]) => kind)).not.toContain('type');
      const qualifiers = [...html.matchAll(/<span class='([^']+)'>(typing|collections|abc)<\/span>/g)];
      expect(qualifiers.map((match) => match[2])).toEqual(['typing', 'typing', 'collections', 'abc', 'typing']);
      expect(qualifiers.map(([, kind]) => kind)).not.toContain('type');
      expect(html).toContain("<span class='type'>Mapping</span>");
    },
  }
);

test('keeps expression-valued starred annotations parseable and preserves following declarations', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const operand of [
      'factory()',
      'factory(typing.Tuple[Ts])',
      '(A | B)',
      '(Ts, Us)',
      '[Ts, Us]',
      '(value := Ts)',
    ]) {
      const source = `def f(*args: *${operand}): pass\nclass Following: pass\n`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(tree.rootNode.firstNamedChild?.text).toBe(`def f(*args: *${operand}): pass`);
        expect(tree.rootNode.lastNamedChild?.text).toBe('class Following: pass');
        if (operand.startsWith('factory(')) {
          expect(tree.rootNode.descendantsOfType('call').map((node) => node.text)).toContain(operand);
        }
      } finally {
        tree.delete();
      }
    }
    for (const operand of ['value := Ts', 'lambda: Ts', 'not Ts', 'Ts if flag else Us']) {
      const source = `def f(*args: *${operand}): pass\nclass Following: pass\n`;
      const invalid = parser.parse(source)!;
      try {
        expect(invalid.rootNode.hasError, source).toBe(true);
        expect(invalid.rootNode.lastNamedChild?.text, source).toBe('class Following: pass');
      } finally {
        invalid.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('exposes qualified generic bases without unpacking through the public tree API', () => {
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, highlights);
  try {
    for (const [source, baseText, baseTree] of [
      ['value: typing.Tuple[int, str] = None', 'typing.Tuple', '(member_type (identifier) (identifier))'],
      ['def f(value: a.b.C[int]): pass', 'a.b.C', '(member_type (member_type (identifier) (identifier)) (identifier))'],
    ]) {
      const tree = parser.parse(source!)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const generic = tree.rootNode.descendantsOfType('generic_type')[0];
        expect(generic?.namedChild(0)?.text, source).toBe(baseText);
        expect(generic?.namedChild(0)?.toString(), source).toBe(baseTree);
        expect(generic?.namedChild(1)?.type, source).toBe('type_parameter');
        expect(tree.rootNode.descendantsOfType('splat_type')).toHaveLength(0);
        const typeNames = query
          .captures(tree.rootNode)
          .filter(({ name }) => name === 'type')
          .map(({ node }) => node.text);
        expect(typeNames).toContain(baseText!.split('.').at(-1));
        expect(typeNames).toContain('int');
        for (const qualifier of baseText!.split('.').slice(0, -1)) {
          expect(typeNames).not.toContain(qualifier);
        }
      } finally {
        tree.delete();
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});
