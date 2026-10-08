// Reference implementation of the key rules: what every wrapper must reproduce.
import { readFileSync } from 'node:fs';

export const rules = JSON.parse(readFileSync(new URL('./scrub-keys.json', import.meta.url), 'utf8'));

export function normalise(key) {
  const drop = new Set(rules.separators);
  return [...key].filter((c) => !drop.has(c)).join('').toLowerCase();
}

export function isDenied(key, extra = []) {
  const k = normalise(key);
  if (k === '') return false;
  if (rules.exact.includes(k) || extra.map(normalise).includes(k)) return true;
  return rules.contains.some(
    (needle) => k.includes(needle) && !(rules.containsExcept[needle] ?? []).some((x) => k.includes(x)),
  );
}

export function isIdentifier(key) {
  const k = normalise(key);
  return rules.identifier.suffix.some((s) => k.endsWith(s)) || rules.identifier.exact.includes(k);
}
