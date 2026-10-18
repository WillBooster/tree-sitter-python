import { expect, test } from 'vitest';
import { renderHighlights } from '../helpers/renderHighlights.js';

test('renders variadic type parameter names as types', () => {
  const html = renderHighlights(`class C[*Ts]: pass
def f[**P](): pass
def g[*Vs](*args: *Vs): pass
type A[*Us] = tuple[*Us]
Ts = 1
P = 2
`);
  const highlights = [...html.matchAll(/<span class='([^']+)'>(Ts|P|Us|Vs)<\/span>/g)].map(([, kind, name]) => [
    name,
    kind,
  ]);
  expect(highlights).toEqual([
    ['Ts', 'type'],
    ['P', 'type'],
    ['Vs', 'type'],
    ['Vs', 'type'],
    ['Us', 'type'],
    ['Us', 'type'],
    ['Ts', 'constructor'],
    ['P', 'constant'],
  ]);
}, 180_000);
