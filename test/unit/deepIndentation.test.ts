import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');

test('parses deeply indented strings without aborting', () => {
  fs.mkdirSync(path.join(repositoryRoot, '.tmp'), { recursive: true });
  const directory = fs.mkdtempSync(path.join(repositoryRoot, '.tmp/deep-indentation-'));
  const parserPath = path.join(directory, 'python.so');
  try {
    execFileSync('script/tree-sitter', ['build', '-o', parserPath, '.'], { cwd: repositoryRoot });
    for (const depth of [510, 511, 512, 600]) {
      const source =
        Array.from({ length: depth }, (_, index) => `${' '.repeat(index)}if 1:\n`).join('') +
        `${' '.repeat(depth)}'a'\n`;
      const sourcePath = path.join(directory, `deep-${depth}.py`);
      fs.writeFileSync(sourcePath, source);
      const result = spawnSync(
        'script/tree-sitter',
        ['parse', '--lib-path', parserPath, '--lang-name', 'python', '-q', '-s', sourcePath],
        { cwd: repositoryRoot, encoding: 'utf8', timeout: 60_000 }
      );
      const output = result.stdout + result.stderr;
      expect(result.error, output).toBeUndefined();
      expect(result.signal, output).toBeNull();
      expect([0, 1], output).toContain(result.status);
      expect(result.stdout, output).toMatch(/^Total parses: 1;/m);
      if (depth === 510) expect(result.status, output).toBe(0);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}, 180_000);
