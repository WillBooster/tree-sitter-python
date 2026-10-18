import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

test('highlights lazy only as an import modifier', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const directory = fs.mkdtempSync(path.join(root, '.tmp/lazy-highlights-'));
  const input = path.join(directory, 'imports.py');
  try {
    fs.writeFileSync(input, 'lazy import json\nlazy from json import dumps\nlazy = 1\nimport lazy\n');
    const html = execFileSync(
      path.join(root, 'script/tree-sitter'),
      ['highlight', '-p', root, '-H', '--layout', 'fragment', '--style', 'minimal', input],
      { cwd: root, encoding: 'utf8' }
    );
    expect(html.match(/<span class='keyword'>lazy<\/span>/g)).toHaveLength(2);
    expect(html.match(/<span class='variable'>lazy<\/span>/g)).toHaveLength(2);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
