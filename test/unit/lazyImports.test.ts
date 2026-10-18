import { expect, test } from 'vitest';
import { renderHighlights } from '../helpers/renderHighlights.js';

test('highlights lazy only as an import modifier', () => {
  const html = renderHighlights('lazy import json\nlazy from json import dumps\nlazy = 1\nimport lazy\n');
  const classes = [...html.matchAll(/<span class='([^']+)'>lazy<\/span>/g)].map(([, capture]) => capture);
  expect(classes).toEqual(['keyword', 'keyword', 'variable', 'variable']);
}, 180_000);
