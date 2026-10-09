import type { Breadcrumb, ErrorEvent } from '@sentry/react';
import { isDenied, isIdKey, isIdentifier } from './keys.js';
import { maskEmails, maskText, stripUrl } from './text.js';

export const FILTERED = '[Filtered]';
const MAX_DEPTH = 12;

/** Replaces denied keys and masks personal data in strings, recursively. */
export function scrubValue(value: unknown, extra: readonly string[] = [], key = '', depth = 0): unknown {
  // An identifier is not free text (a digit-only span id would pass for a card), but an SDK may build
  // `user.id` from the e-mail, so an `*id` value still loses an address.
  if (typeof value === 'string') return isIdKey(key) ? maskEmails(value) : isIdentifier(key) ? value : maskText(value);
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
  if (user?.id !== undefined) clean.user = { id: typeof user.id === 'string' ? maskEmails(user.id) : user.id };
  if (request?.url !== undefined) {
    clean.request = { url: stripUrl(request.url), method: request.method };
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
  const clean = scrubValue(crumb, extra) as Breadcrumb;
  // A navigation or request crumb carries URLs, whose query and fragment hold tokens.
  const data = clean.data as Record<string, unknown> | undefined;
  if (data) {
    for (const k of ['url', 'from', 'to']) {
      if (typeof data[k] === 'string') data[k] = stripUrl(data[k] as string);
    }
  }
  return clean;
}
