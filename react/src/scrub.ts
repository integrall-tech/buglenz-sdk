import type { Breadcrumb, ErrorEvent } from '@sentry/react';
import { isDenied, isIdentifier } from './keys';
import { maskText } from './text';

export const FILTERED = '[Filtered]';
const MAX_DEPTH = 12;

/** Replaces denied keys and masks personal data in strings, recursively. */
export function scrubValue(value: unknown, extra: readonly string[] = [], key = '', depth = 0): unknown {
  if (typeof value === 'string') return isIdentifier(key) ? value : maskText(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return FILTERED;
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, extra, key, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = isDenied(k, extra) ? FILTERED : scrubValue(v, extra, k, depth + 1);
  }
  return out;
}

/** Layer 1 for events: nothing personal leaves the browser. */
export function scrubEvent<T extends ErrorEvent>(event: T, extra: readonly string[] = []): T {
  const { user, request, ...rest } = event;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    // Stack frames are code, not user data: masking their text would only corrupt them.
    clean[k] = k === 'exception' ? scrubException(v as never, extra) : isDenied(k, extra) ? FILTERED : scrubValue(v, extra, k);
  }
  if (user?.id !== undefined) clean.user = { id: user.id };
  if (request?.url !== undefined) {
    clean.request = { url: maskText(request.url.split('?')[0]), method: request.method };
  }
  return clean as T;
}

function scrubException(exception: { values?: Array<Record<string, unknown>> }, extra: readonly string[]) {
  if (!exception?.values) return exception;
  return {
    ...exception,
    values: exception.values.map(({ stacktrace, ...value }) => ({
      ...(scrubValue(value, extra) as Record<string, unknown>),
      ...(stacktrace ? { stacktrace } : {}),
    })),
  };
}

/** Layer 1 for breadcrumbs: typed text is dropped, everything else is masked. */
export function scrubBreadcrumb(crumb: Breadcrumb, extra: readonly string[] = []): Breadcrumb | null {
  if (crumb.category === 'ui.input') return null;
  return scrubValue(crumb, extra) as Breadcrumb;
}
