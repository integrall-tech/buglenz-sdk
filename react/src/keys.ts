import rules from './scrub-keys.json' with { type: 'json' };

/** Lowercase, without the separators people disagree about. */
export function normalise(key: string): string {
  const drop = new Set(rules.separators);
  return [...key].filter((c) => !drop.has(c)).join('').toLowerCase();
}

/** Whether the value under this key must be replaced. */
export function isDenied(key: string, extra: readonly string[] = []): boolean {
  const k = normalise(key);
  if (k === '') return false;
  if ((rules.exact as string[]).includes(k) || extra.some((e) => normalise(e) === k)) return true;
  const except = rules.containsExcept as Record<string, string[]>;
  return rules.contains.some(
    (needle) => k.includes(needle) && !(except[needle] ?? []).some((x) => k.includes(x)),
  );
}

/** Keys that hold identifiers or timestamps, never free text: the masks skip them. */
export function isIdentifier(key: string): boolean {
  const k = normalise(key);
  return rules.identifier.suffix.some((s) => k.endsWith(s)) || rules.identifier.exact.includes(k);
}
