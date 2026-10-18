import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function renderHighlights(source: string): string {
  const root = path.resolve(import.meta.dirname, '../..');
  fs.mkdirSync(path.join(root, '.tmp'), { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, '.tmp/highlights-'));
  const input = path.join(directory, 'input.py');
  try {
    fs.writeFileSync(input, source);
    return execFileSync(
      path.join(root, 'script/tree-sitter'),
      ['highlight', '-p', root, '-H', '--layout', 'fragment', '--style', 'minimal', input],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 170_000,
        env: { ...process.env, TREE_SITTER_LIBDIR: path.join(root, '.tmp/tree-sitter-lib') },
      }
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
