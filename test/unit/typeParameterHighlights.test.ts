import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('highlights defaulted type parameter names, bounds, and direct defaults as types', async () => {
  await Parser.init();
  const root = path.resolve(import.meta.dirname, '../..');
  const language = await Language.load(path.join(root, 'tree-sitter-python.wasm'));
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(language, fs.readFileSync(path.join(root, 'queries/highlights.scm'), 'utf8'));
  try {
    for (const source of [
      'class C[T, U: Bound = Default, *Ts = Pack, **P = Params]: pass',
      'def f[T, U: Bound = Default, *Ts = Pack, **P = Params](): pass',
      'type A[T, U: Bound = Default, *Ts = Pack, **P = Params] = tuple[T]',
    ]) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const types = query.captures(tree.rootNode).filter((capture) => capture.name === 'type');
        expect(types.map((capture) => capture.node.text)).toEqual(
          expect.arrayContaining(['T', 'U', 'Bound', 'Default', 'Ts', 'Pack', 'P', 'Params'])
        );
      } finally {
        tree.delete();
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});

test('renders nested default and bound type names with the type highlight', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const directory = fs.mkdtempSync(path.join(root, '.tmp/type-highlights-'));
  const input = path.join(directory, 'types.py');
  try {
    fs.writeFileSync(
      input,
      [
        'class C[T: list[dict[str, int]] = list[dict[str, int]]]: pass',
        'def f[*Ts = *tuple[int, str], **P = [str]](): pass',
        'type A[T: (int, str) = list[int]] = T',
        'class D[T: list[int] | None = list[str] | None]: pass',
        'class E[T: int | str = typing.List[int]]: pass',
        'class F[T = typing.Dict[str, typing.List[int | str]]]: pass',
        'class G[T = (list[int] | None), **P = [typing.List[str] | None]]: pass',
        'class H[T = int | str | None, *Ts = *typing.Tuple[int, str]]: pass',
        'class I[*Ts = *(typing.Tuple[int] | tuple[str])]: pass',
        'class J[T: typing.Protocol = typing.List[int]]: pass',
      ].join('\n')
    );
    const html = execFileSync(
      path.join(root, 'script/tree-sitter'),
      ['highlight', '-p', root, '-H', '--layout', 'fragment', '--style', 'minimal', input],
      { cwd: root, encoding: 'utf8' }
    );
    expect(html.match(/<span class='type'>(?:int|str)<\/span>/g)).toHaveLength(27);
    expect(html).not.toMatch(/<span class='variable'>(?:int|str)<\/span>/);
    expect(html).toContain("<span class='type'>Protocol</span>");
    expect(html).toContain("<span class='type'>List</span>");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
