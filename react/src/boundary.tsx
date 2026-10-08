import { ErrorBoundary as SentryErrorBoundary } from '@sentry/react';
import type { ComponentProps, ReactNode } from 'react';

type Props = Omit<ComponentProps<typeof SentryErrorBoundary>, 'fallback'> & {
  /** Replaces the plain fallback; the app (or a component library) decides how it looks. */
  fallback?: ComponentProps<typeof SentryErrorBoundary>['fallback'];
  children?: ReactNode;
};

function DefaultFallback() {
  return (
    <div role="alert">
      <p>Something went wrong.</p>
      <button type="button" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}

/** Reports the error to the instance and shows a plain fallback; no UI library involved. */
export function ErrorBoundary({ fallback, ...rest }: Props) {
  return <SentryErrorBoundary {...rest} fallback={fallback ?? <DefaultFallback />} />;
}
