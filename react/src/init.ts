import * as Sentry from '@sentry/react';
import type { BrowserOptions } from '@sentry/react';
import { scrubBreadcrumb, scrubEvent } from './scrub.js';
import { isDenied } from './keys.js';
import { releaseOf } from './release.js';
import { maskText } from './text.js';

/** What the wrapper decides: an app cannot override these through `extra`. */
type Fixed = 'dsn' | 'release' | 'environment' | 'dataCollection' | 'beforeSend' | 'beforeBreadcrumb' | 'initialScope';

export interface BugLenzOptions {
  /** DSN of the project in the instance. There is no fallback. */
  dsn: string;
  /** Deployable app name; the release becomes `<app>@<version>`. */
  app: string;
  version: string;
  environment: string;
  tenant?: string;
  cliente?: string;
  /** Extra keys (besides the shared list) whose values are removed. */
  extraDeniedKeys?: string[];
  /** Throw on misuse (for example, an e-mail passed to `identify`). Default: everything but `production`. */
  strict?: boolean;
  /** Runs after the wrapper's own filter, so it only sees clean events. */
  beforeSend?: BrowserOptions['beforeSend'];
  /** Anything the wrapper does not fix. */
  extra?: Omit<Partial<BrowserOptions>, Fixed>;
}

let strictMode = true;
let extraKeys: string[] = [];

export function initBugLenz(options: BugLenzOptions): void {
  if (!options.dsn) throw new Error('BugLenz: "dsn" is required; take it from the project in the instance');
  if (!options.environment) throw new Error('BugLenz: "environment" is required');
  const release = releaseOf(options.app, options.version);
  extraKeys = options.extraDeniedKeys ?? [];
  strictMode = options.strict ?? options.environment !== 'production';

  const tags: Record<string, string> = {};
  if (options.tenant) tags.tenant = options.tenant;
  if (options.cliente) tags.cliente = options.cliente;

  Sentry.init({
    ...options.extra,
    dsn: options.dsn,
    release,
    environment: options.environment,
    initialScope: { tags },
    // The SDK collects by default; here it collects nothing it does not need.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    beforeSend: (event, hint) => {
      const clean = scrubEvent(event, extraKeys);
      return options.beforeSend ? options.beforeSend(clean, hint) : clean;
    },
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb, extraKeys),
  });
}

/**
 * Tells the instance who the user is, by internal id only. E-mail, documents
 * and anything else are refused: they are not needed to group or find errors.
 */
export function identify(user: { id: string }): void {
  const extras = Object.keys(user).filter((k) => k !== 'id');
  const looksPersonal = typeof user.id !== 'string' || user.id === '' || maskText(user.id) !== user.id || user.id.includes('@');
  if (extras.length > 0 || looksPersonal || isDenied(user.id)) {
    const why = extras.length > 0 ? `unexpected field(s): ${extras.join(', ')}` : 'the id is empty or looks like personal data';
    if (strictMode) throw new Error(`BugLenz: identify() takes an internal id only (${why})`);
    console.warn(`BugLenz: identify() ignored (${why})`);
    return;
  }
  Sentry.setUser({ id: user.id });
}

export function clearIdentity(): void {
  Sentry.setUser(null);
}
