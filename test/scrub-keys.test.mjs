import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rules, normalise, isDenied, isIdentifier } from '../shared/scrub-keys.mjs';
import { readServerKeys, parseServerKeys } from '../scripts/read-server-keys.mjs';

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

// What the reader of the instance's source must extract. A sample in the shape of the real file, so a
// change in that shape breaks here, with a message that says what to update, and not silently in CI.
const SAMPLE = `
const EXACT: &[&str] = &["password", "token"];
const CONTAINS: &[&str] = &["secret", "token"];
fn normalise(key: &str) -> String { key.chars().filter(|c| !matches!(c, '_' | '-' | ' ' | '.')).collect() }
fn matches_by_content(key: &str) -> bool {
    CONTAINS.iter().any(|needle| key.contains(needle) && !(*needle == "token" && key.contains("tokens")))
}
pub fn is_identifier(key: &str) -> bool {
    let key = normalise(key);
    key.ends_with("id")
        || matches!(key.as_str(), "timestamp" | "release" | "dist")
}
`;

test('the reader extracts every list from the instance source', () => {
  const k = parseServerKeys(SAMPLE);
  assert.deepEqual(k.exact, ['password', 'token']);
  assert.deepEqual(k.contains, ['secret', 'token']);
  assert.deepEqual(k.containsExcept, { token: ['tokens'] });
  assert.deepEqual(k.identifier, { suffix: ['id'], exact: ['dist', 'release', 'timestamp'] });
  assert.deepEqual(k.separators, [' ', '-', '.', '_']);
});

test('the reader says what to update when the shape changes', () => {
  assert.throws(() => parseServerKeys('const EXACT: &[&str] = &["a"];'), /not found/);
});

// BUGLENZ_SERVER_KEYS_RS (a path) or BUGLENZ_SERVER_KEYS_URL (the file on the instance's public repository)
// says where the instance's keys.rs is. CI sets the URL; on a laptop without either only this comparison is skipped.
const where = process.env.BUGLENZ_SERVER_KEYS_RS || process.env.BUGLENZ_SERVER_KEYS_URL;
test('lists match the instance', { skip: !where }, async () => {
  const server = await readServerKeys(where);
  assert.deepEqual(rules.exact, server.exact, 'exact');
  assert.deepEqual(rules.contains, server.contains, 'contains');
  assert.deepEqual(rules.containsExcept, server.containsExcept, 'containsExcept');
  assert.deepEqual(rules.identifier.suffix, server.identifier.suffix, 'identifier.suffix');
  assert.deepEqual([...rules.identifier.exact].sort(), server.identifier.exact, 'identifier.exact');
  assert.deepEqual([...rules.separators].sort(), server.separators, 'separators');
});
