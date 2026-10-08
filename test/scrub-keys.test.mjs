import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rules, normalise, isDenied, isIdentifier } from '../shared/scrub-keys.mjs';
import { readServerKeys } from '../scripts/read-server-keys.mjs';

const vectors = JSON.parse(readFileSync(new URL('../shared/scrub-vectors.json', import.meta.url), 'utf8'));

test('lists are normalised, sorted and free of duplicates', () => {
  for (const name of ['exact', 'contains']) {
    const list = rules[name];
    assert.deepEqual(list, [...new Set(list.map(normalise))].sort(), name);
  }
});

for (const v of vectors) {
  test(`vector: ${JSON.stringify(v.key)}`, () => {
    assert.equal(isDenied(v.key), v.denied);
    if ('identifier' in v) assert.equal(isIdentifier(v.key), v.identifier);
  });
}

test('extra keys extend the exact list', () => {
  assert.equal(isDenied('matricula'), false);
  assert.equal(isDenied('Matri-cula', ['matricula']), true);
});

// BUGLENZ_SERVER_KEYS_RS points at the instance's keys.rs; without it only the
// comparison is skipped.
test('lists match the instance', { skip: !process.env.BUGLENZ_SERVER_KEYS_RS }, () => {
  const server = readServerKeys(process.env.BUGLENZ_SERVER_KEYS_RS);
  assert.deepEqual(rules.exact, server.exact);
  assert.deepEqual(rules.contains, server.contains);
});
