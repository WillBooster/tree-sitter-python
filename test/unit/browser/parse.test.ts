/// <reference types="vite/client" />
import { Language, Parser } from '@willbooster/web-tree-sitter';
import runtimeUrl from '@willbooster/web-tree-sitter/web-tree-sitter.wasm?url';
import { expect, test } from 'vitest';

import pythonUrl from '../../../tree-sitter-python.wasm?url';

test('parses in a browser, loading the Wasm files over HTTP', async () => {
  await Parser.init({ locateFile: () => runtimeUrl });
  const parser = new Parser();
  parser.setLanguage(await Language.load(pythonUrl));
  expect(parser.parse('def main(): pass')?.rootNode.toString()).toBe(
    '(module (function_definition name: (identifier) parameters: (parameters) body: (block (pass_statement))))'
  );
});
