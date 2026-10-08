# @integrall/buglenz-react

Thin wrapper around `@sentry/react` 11.5.0 for apps that report to a BugLenz instance.
No UI library is required.

```tsx
import { initBugLenz, ErrorBoundary, identify } from '@integrall/buglenz-react';

initBugLenz({
  dsn: import.meta.env.VITE_BUGLENZ_DSN,
  app: 'vendax-web',            // release becomes "vendax-web@<version>"
  version: __APP_VERSION__,
  environment: 'production',
  tenant: 'acme-sp',
  cliente: 'acme',
});

identify({ id: user.id });      // internal id only; e-mail or documents are refused

<ErrorBoundary fallback={<MyFallback />}>{children}</ErrorBoundary>
```

## What it fixes

| Item | Value |
|---|---|
| `release` | `<app>@<version>`; `app` is lowercase letters, digits, `.`, `_`, `-` |
| Data collection | `dataCollection` off: no user info, cookies, headers, bodies, query strings, local variables |
| Events | `user` reduced to `id`; `request` reduced to URL without query; keys from `shared/scrub-keys.json` replaced by `[Filtered]`; CPF, CNPJ, card numbers and e-mail masked in text |
| Breadcrumbs | typed text (`ui.input`) dropped; the rest masked the same way |
| DSN | required; the app fails at startup without it |

`sendDefaultPii` no longer exists in `@sentry/react` 11.x: the equivalent is `dataCollection`, which
collects **everything by default**. Initialising the SDK directly is therefore not safe; use the wrapper.

## Source maps (Vite)

```ts
import { brandSourceMaps } from '@integrall/buglenz-react/vite';

plugins: [brandSourceMaps({ url: 'https://errors.example.com', authToken: process.env.BUGLENZ_TOKEN!,
                            project: 'vendax-web', app: 'vendax-web', version })],
build: { sourcemap: true },
```

The plugin's own telemetry is off, the maps go to the instance only and are deleted from the build.

## Known limits

- No tunnel: ad blockers can stop events sent straight from the browser.
- Router integration is not included yet; pass an integration through `extra.integrations`.
- The ESM build uses extensionless imports and is meant for bundlers.
