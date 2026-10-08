import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDenied, isIdentifier } from '../src/keys';
import { maskText } from '../src/text';

const here = dirname(fileURLToPath(import.meta.url));
const shared = (f: string) => readFileSync(join(here, '..', '..', 'shared', f), 'utf8');

describe('shared files', () => {
  it('keeps the packaged key list identical to the shared one', () => {
    expect(readFileSync(join(here, '..', 'src', 'scrub-keys.json'), 'utf8')).toBe(shared('scrub-keys.json'));
  });

  it.each(JSON.parse(shared('scrub-vectors.json')) as any[])('key vector %j', (v: any) => {
    expect(isDenied(v.key)).toBe(v.denied);
    if ('identifier' in v) expect(isIdentifier(v.key)).toBe(v.identifier);
  });

  it.each(JSON.parse(shared('text-vectors.json')) as any[])('text vector %j', (v: any) => {
    expect(maskText(v.in)).toBe(v.out);
  });
});
