# Compatibility matrix

A pair (SDK version, instance version) enters this table only after `contract/run.sh` passes with
it (`contract/run.sh <image> all`); a pair that fails is listed as not homologated.

| Wrapper | Official SDK | Instance image | Result | Checks | Date |
|---|---|---|---|---|---|
| `@integrall/buglenz-react` 0.1.0 | `@sentry/react` 11.5.0, `@sentry/vite-plugin` 5.4.1 | `buglenz-server:v0.16.0-itl.5` | homologated | 14 | 2026-10-08 |
| `buglenz-spring-boot-starter` 0.1.0 | `sentry-spring-boot-starter-jakarta` 8.60.0 (Spring Boot 3.5.16, Java 21) | `buglenz-server:v0.16.0-itl.5` | homologated | 16 | 2026-10-08 |
| `buglenz_flutter` 0.1.0 | `sentry_flutter` 9.30.1 (Flutter 3.41.2, Dart 3.11) | `buglenz-server:v0.16.0-itl.6` | homologated (Dart layer, see below) | 14 | 2026-10-09 |

## What a run proves

- React: three issues (click handler, promise rejection, render error caught by the wrapper's
  `ErrorBoundary`); source-mapped frame with original file, line and context; stored user is the id
  only; tags, release and environment; documents masked; none of the original personal values in
  what left the browser nor in what was stored; the session is counted as errored, not crashed.
- Spring Boot: handled and uncaught exceptions; same privacy checks on what left the JVM and on what
  was stored; no session item sent, release health empty and never negative.

- Flutter: a handled and a second exception; same privacy checks on what left the app and on what was
  stored (user id only, tags, release with the `+` of the pubspec kept, custom contexts filtered, no
  device identifier); the instance accepts the Dart SDK's chunked upload.
  **Limit of this run:** `flutter test` has no platform plugin, so the SDK's native transport (a
  platform-channel call) has nothing to talk to. The probe swaps only the transport for one that posts
  the same envelope over HTTP. Events raised in the native layer (Android, iOS) never pass through the
  Dart filters and are not covered here (see the onboarding guide, section 3b).

## Requirements on the instance

- `PUBLIC_URL` must be the address clients reach. The instance advertises it as the upload address of
  source maps; without it, `sentry-cli` is sent to `http://0.0.0.0:<port>` and the upload fails.
- The published image runs on PostgreSQL only.
