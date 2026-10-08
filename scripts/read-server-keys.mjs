// Reads the key lists out of the instance's Rust source, to compare with ours.
import { readFileSync } from 'node:fs';

function list(source, name) {
  const m = source.match(new RegExp(`const ${name}: &\\[&str\\] = &\\[([\\s\\S]*?)\\];`));
  if (!m) throw new Error(`const ${name} not found`);
  return [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]).sort();
}

export function readServerKeys(path) {
  const source = readFileSync(path, 'utf8');
  return { exact: list(source, 'EXACT'), contains: list(source, 'CONTAINS') };
}
