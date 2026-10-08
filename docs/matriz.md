# Compatibility matrix

A pair (SDK version, instance version) enters this table only after `contract/run.sh` passes with
it (`contract/run.sh <image> all`); a pair that fails is listed as not homologated.

| Wrapper | Official SDK | Instance image | Result | Checks | Date |
|---|---|---|---|---|---|
| `@integrall/buglenz-react` 0.1.0 | `@sentry/react` 11.5.0, `@sentry/vite-plugin` 5.4.1 | `buglenz-server:v0.16.0-itl.5` | homologated | 14 | 2026-10-08 |
| `buglenz-spring-boot-starter` 0.1.0 | `sentry-spring-boot-starter-jakarta` 8.60.0 (Spring Boot 3.5.16, Java 21) | `buglenz-server:v0.16.0-itl.5` | homologated | 16 | 2026-10-08 |

## What a run proves

- React: three issues (click handler, promise rejection, render error caught by the wrapper's
  `ErrorBoundary`); source-mapped frame with original file, line and context; stored user is the id
  only; tags, release and environment; documents masked; none of the original personal values in
  what left the browser nor in what was stored; the session is counted as errored, not crashed.
- Spring Boot: handled and uncaught exceptions; same privacy checks on what left the JVM and on what
  was stored; no session item sent, release health empty and never negative.

## Requirements on the instance

- `PUBLIC_URL` must be the address clients reach. The instance advertises it as the upload address of
  source maps; without it, `sentry-cli` is sent to `http://0.0.0.0:<port>` and the upload fails.
- The published image runs on PostgreSQL only.
