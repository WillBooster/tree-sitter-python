import path from 'node:path';

import { Language, Parser } from '@willbooster/web-tree-sitter';
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
