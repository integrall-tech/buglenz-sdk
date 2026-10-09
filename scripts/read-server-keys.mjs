// Reads the key rules out of the instance's Rust source, to compare with ours.
//
// The instance writes its rules as code, not data, so this reader looks for the exact shapes the code
// uses (two constant lists, the `tokens` exception, the `ends_with("id")` suffix, the identifier names,
// the separator characters). When one of them is not found it fails and names it: that means the source
// changed shape, and the reader (or the shared list) has to follow.
import { readFileSync } from 'node:fs';

function must(source, re, what) {
  const m = source.match(re);
  if (!m) throw new Error(`${what} not found in the instance source: its shape changed, update scripts/read-server-keys.mjs`);
  return m;
}

function strings(text) {
  return [...text.matchAll(/"([^"]*)"/g)].map((x) => x[1]);
}

function list(source, name) {
  const m = must(source, new RegExp(`const ${name}: &\\[&str\\] = &\\[([\\s\\S]*?)\\];`), `const ${name}`);
  return strings(m[1]).sort();
}

export function parseServerKeys(source) {
  // `!(*needle == "token" && key.contains("tokens"))`: a needle that does not count when another word is present.
  const containsExcept = {};
  for (const m of source.matchAll(/\*needle == "([^"]+)" && key\.contains\("([^"]+)"\)/g)) {
    (containsExcept[m[1]] ??= []).push(m[2]);
  }
  const identifierFn = must(source, /fn is_identifier[\s\S]*?\n\}/, 'fn is_identifier')[0];
  const suffix = [...identifierFn.matchAll(/ends_with\("([^"]+)"\)/g)].map((m) => m[1]);
  const exact = strings(must(identifierFn, /matches!\(\s*key\.as_str\(\),([\s\S]*?)\)/, 'the identifier names')[1]).sort();
  const separators = [...must(source, /fn normalise[\s\S]*?matches!\(c, ([^)]*)\)/, 'the separators in fn normalise')[1].matchAll(/'(.)'/g)].map((m) => m[1]).sort();
  return {
    exact: list(source, 'EXACT'),
    contains: list(source, 'CONTAINS'),
    containsExcept,
    identifier: { suffix, exact },
    separators,
  };
}

/** `where` is a file path or an http(s) URL. */
export async function readServerKeys(where) {
  const source = /^https?:\/\//.test(where)
    ? await fetch(where).then((r) => {
        if (!r.ok) throw new Error(`could not read ${where}: HTTP ${r.status}`);
        return r.text();
      })
    : readFileSync(where, 'utf8');
  return parseServerKeys(source);
}
