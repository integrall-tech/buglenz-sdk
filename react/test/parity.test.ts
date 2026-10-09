import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { maskEmails, stripUrl } from '../src/text';
import { scrubBreadcrumb, scrubEvent } from '../src/scrub';

const here = dirname(fileURLToPath(import.meta.url));
const shared = (f: string) => JSON.parse(readFileSync(join(here, '..', '..', 'shared', f), 'utf8')) as { in: string; out: string }[];

// Layer 1 must give the same answer as the other wrappers and the instance for the same input
// (audit of 2026-10-09, invariant I4).
describe('shared vectors', () => {
  it.each(shared('url-vectors.json'))('url vector %j', (v) => {
    expect(stripUrl(v.in)).toBe(v.out);
  });

  it.each(shared('id-vectors.json'))('id vector %j', (v) => {
    expect(maskEmails(v.in)).toBe(v.out);
  });
});

describe('what the event filter does with ids and urls', () => {
  it('masks an e-mail the SDK put in user.id', () => {
    const out = scrubEvent({ user: { id: 'ana@example.com', email: 'ana@example.com' } } as never) as any;
    expect(out.user).toEqual({ id: '[email]' });
  });

  it('keeps an ordinary user id', () => {
    expect((scrubEvent({ user: { id: 'u-42' } } as never) as any).user).toEqual({ id: 'u-42' });
  });

  it('drops the query string and the fragment of the request url', () => {
    const out = scrubEvent({ request: { url: 'https://a.example.com/p?x=1#access_token=abc', method: 'GET' } } as never) as any;
    expect(out.request).toEqual({ url: 'https://a.example.com/p', method: 'GET' });
  });

  it('masks an e-mail under a key that ends in id, and leaves other ids alone', () => {
    const out = scrubEvent({ extra: { customer_id: 'ana@example.com', order_id: '4111111111111111' } } as never) as any;
    expect(out.extra).toEqual({ customer_id: '[email]', order_id: '4111111111111111' });
  });

  it('cleans the urls inside breadcrumbs the same way', () => {
    const crumb = scrubBreadcrumb({ category: 'navigation', data: { from: '/a?x=1#t', to: '/b/ana@example.com#t' } } as never) as any;
    expect(crumb.data).toEqual({ from: '/a', to: '/b/[email]' });
  });
});
