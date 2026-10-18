import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

test('renders variadic type parameter names as types', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const directory = fs.mkdtempSync(path.join(root, '.tmp/variadic-highlights-'));
  const input = path.join(directory, 'types.py');
  try {
    fs.writeFileSync(
      input,
      `class C[*Ts]: pass
def f[**P](): pass
type A[*Us] = tuple[*Us]
Ts = 1
P = 2
`
    );
    const html = execFileSync(
      path.join(root, 'script/tree-sitter'),
      ['highlight', '-p', root, '-H', '--layout', 'fragment', '--style', 'minimal', input],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 170_000,
        env: { ...process.env, TREE_SITTER_LIBDIR: path.join(root, '.tmp/tree-sitter-lib') },
      }
    );
    const highlights = [...html.matchAll(/<span class='([^']+)'>(Ts|P|Us)<\/span>/g)].map(([, kind, name]) => [
      name,
      kind,
    ]);
    expect(highlights).toEqual([
      ['Ts', 'type'],
      ['P', 'type'],
      ['Us', 'type'],
      ['Us', 'type'],
      ['Ts', 'constructor'],
      ['P', 'constant'],
    ]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}, 180_000);
