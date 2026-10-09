import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as Sentry from '@sentry/react';

vi.mock('@sentry/react', async (orig) => ({
  ...(await orig<typeof import('@sentry/react')>()),
  init: vi.fn(),
  setUser: vi.fn(),
}));
import { ErrorBoundary, identify, initBugLenz, scrubBreadcrumb, scrubEvent, releaseOf } from '../src';

const base = { dsn: 'http://key@localhost:1/1', app: 'vendax-web', version: '1.4.2', environment: 'homolog' };

describe('initBugLenz', () => {
  

  it('builds the release and tags and turns data collection off', () => {
    const init = vi.mocked(Sentry.init);
    initBugLenz({ ...base, tenant: 't1', cliente: 'acme' });
    const o = init.mock.calls.at(-1)![0]!;
    expect(o.release).toBe('vendax-web@1.4.2');
    expect(o.environment).toBe('homolog');
    expect(o.initialScope).toEqual({ tags: { tenant: 't1', cliente: 'acme' } });
    expect(o.dataCollection).toMatchObject({ userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false });
  });

  it('filters transactions and spans too, which the app may switch on through extra', () => {
    const init = vi.mocked(Sentry.init);
    initBugLenz({ ...base, extra: { tracesSampleRate: 1 } });
    const o = init.mock.calls.at(-1)![0]!;
    expect(o.beforeSendTransaction).toBeTypeOf('function');
    const out = o.beforeSendTransaction!(
      {
        type: 'transaction',
        transaction: '/clientes/ana@example.com',
        user: { id: 'u-1', email: 'ana@example.com' },
        request: { url: 'https://a.example.com/c?token=abc#t', headers: { cookie: 'a=b' } },
        spans: [{ span_id: 'a1', trace_id: 'b2', description: 'GET /api/clientes/ana@example.com?x=1', start_timestamp: 1, data: { password: 'hunter2' } }],
      } as never,
      {} as never,
    ) as any;
    expect(out.transaction).toBe('/clientes/[email]');
    expect(out.user).toEqual({ id: 'u-1' });
    expect(out.request).toEqual({ url: 'https://a.example.com/c', method: undefined });
    expect(out.spans[0].description).toBe('GET /api/clientes/[email]?x=1');
    expect(out.spans[0].data.password).toBe('[Filtered]');
    expect(out.spans[0].span_id).toBe('a1');
  });

  it('does not let extra override what the wrapper fixes', () => {
    const init = vi.mocked(Sentry.init);
    initBugLenz({ ...base, extra: { sampleRate: 0.5, release: 'x', dsn: 'y' } as never });
    const o = init.mock.calls.at(-1)![0]!;
    expect(o.sampleRate).toBe(0.5);
    expect(o.release).toBe('vendax-web@1.4.2');
    expect(o.dsn).toBe(base.dsn);
  });

  it('fails visibly without a DSN or with a bad app or version', () => {
    expect(() => initBugLenz({ ...base, dsn: '' })).toThrow(/dsn/);
    expect(() => initBugLenz({ ...base, app: 'Vendax Web' })).toThrow(/app/);
    expect(() => releaseOf('app', '1.0@x')).toThrow(/version/);
  });
});

describe('identify', () => {
  beforeEach(() => vi.spyOn(Sentry, 'init').mockImplementation(() => undefined));
  

  it('accepts an internal id only', () => {
    const set = vi.mocked(Sentry.setUser);
    set.mockClear();
    initBugLenz(base);
    identify({ id: 'u-42' });
    expect(set).toHaveBeenCalledWith({ id: 'u-42' });
  });

  it('throws outside production when given an e-mail or a document', () => {
    initBugLenz(base);
    expect(() => identify({ id: 'u-1', email: 'ana@example.com' } as never)).toThrow(/email/);
    expect(() => identify({ id: 'ana@example.com' })).toThrow(/personal/);
    expect(() => identify({ id: '529.982.247-25' })).toThrow(/personal/);
  });

  it('drops and warns in production', () => {
    const set = vi.mocked(Sentry.setUser);
    set.mockClear();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    initBugLenz({ ...base, environment: 'production' });
    identify({ id: 'u-1', email: 'ana@example.com' } as never);
    expect(set).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
});

describe('layer 1 filters', () => {
  it('removes personal data from an event', () => {
    const event = {
      message: 'pedido recusado para cpf 529.982.247-25 (ana@example.com)',
      user: { id: 'u-42', email: 'ana@example.com', ip_address: '1.2.3.4' },
      request: { url: 'https://app.test/pay?token=abc', headers: { Cookie: 'a=b' }, cookies: { a: 'b' }, data: { x: 1 } },
      extra: { password: 'hunter2', note: 'mail ana@example.com' },
      tags: { cliente: 'acme' },
      exception: { values: [{ type: 'Error', value: 'falhou para ana@example.com', stacktrace: { frames: [{ filename: 'a.ts', context_line: 'x@y.com' }] } }] },
    };
    const out = scrubEvent(event as never) as Record<string, any>;
    expect(out.message).toBe('pedido recusado para cpf [cpf] ([email])');
    expect(out.user).toEqual({ id: 'u-42' });
    expect(out.request).toEqual({ url: 'https://app.test/pay', method: undefined });
    expect(out.extra).toEqual({ password: '[Filtered]', note: 'mail [email]' });
    expect(out.tags).toEqual({ cliente: 'acme' });
    expect(out.exception.values[0].value).toBe('falhou para [email]');
    expect(out.exception.values[0].stacktrace.frames[0].context_line).toBe('x@y.com');
  });

  it('keeps identifiers intact and drops typed text from breadcrumbs', () => {
    const out = scrubEvent({ contexts: { trace: { span_id: '4111111111111111' } } } as never) as Record<string, any>;
    expect(out.contexts.trace.span_id).toBe('4111111111111111');
    expect(scrubBreadcrumb({ category: 'ui.input', message: 'ana@example.com' })).toBeNull();
    expect(scrubBreadcrumb({ category: 'console', message: 'oi ana@example.com' })?.message).toBe('oi [email]');
  });
});

describe('ErrorBoundary', () => {
  it('shows a plain fallback when a child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Boom = () => {
      throw new Error('boom');
    };
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert').textContent).toContain('Something went wrong');
  });

  it('uses the fallback the app provides', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Boom = () => {
      throw new Error('boom');
    };
    render(
      <ErrorBoundary fallback={<p>custom</p>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('custom')).toBeTruthy();
  });
});
