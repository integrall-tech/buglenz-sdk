export { initBugLenz, identify, clearIdentity, releaseOf } from './init';
export type { BugLenzOptions } from './init';
export { ErrorBoundary } from './boundary';
export { scrubEvent, scrubBreadcrumb, scrubValue, FILTERED } from './scrub';
export { maskText } from './text';
export { isDenied, isIdentifier } from './keys';
export { captureException, captureMessage, setTag, withScope } from '@sentry/react';
