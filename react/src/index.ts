export { initBugLenz, identify, clearIdentity } from './init.js';
export { releaseOf } from './release.js';
export type { BugLenzOptions } from './init.js';
export { ErrorBoundary } from './boundary.js';
export { scrubEvent, scrubBreadcrumb, scrubValue, FILTERED } from './scrub.js';
export { maskText } from './text.js';
export { isDenied, isIdentifier } from './keys.js';
export { captureException, captureMessage, setTag, withScope } from '@sentry/react';
