// Generates flutter/lib/src/scrub_keys.g.dart from shared/scrub-keys.json.
// Run after changing the shared list: node scripts/sync-flutter-rules.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const rules = JSON.parse(readFileSync(new URL('../shared/scrub-keys.json', import.meta.url), 'utf8'));
const list = (a) => a.map((x) => `'${x}'`).join(', ');
const except = Object.entries(rules.containsExcept)
  .map(([k, v]) => `'${k}': [${list(v)}]`)
  .join(', ');

const out = `// GENERATED from shared/scrub-keys.json by scripts/sync-flutter-rules.mjs. Do not edit.

const scrubSeparators = <String>[${list(rules.separators)}];
const scrubExact = <String>{${list(rules.exact)}};
const scrubContains = <String>[${list(rules.contains)}];
const scrubContainsExcept = <String, List<String>>{${except}};
const identifierSuffix = <String>[${list(rules.identifier.suffix)}];
const identifierExact = <String>{${list(rules.identifier.exact)}};
`;
writeFileSync(new URL('../flutter/lib/src/scrub_keys.g.dart', import.meta.url), out);
console.log('wrote flutter/lib/src/scrub_keys.g.dart');
