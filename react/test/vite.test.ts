import { describe, expect, it } from 'vitest';
import { brandSourceMaps } from '../src/vite';

describe('brandSourceMaps', () => {
  it('needs url, token and project', () => {
    expect(() => brandSourceMaps({ url: '', authToken: 't', project: 'p', app: 'a', version: '1' })).toThrow(/url/);
  });
  it('returns a plugin', () => {
    const p = brandSourceMaps({ url: 'http://localhost:1', authToken: 't', project: 'p', app: 'vendax-web', version: '1.0.0' });
    expect(p).toBeTruthy();
  });
});
