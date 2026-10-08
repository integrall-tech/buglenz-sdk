# buglenz-sdk

Thin wrappers around the official Sentry SDKs for apps that report errors to a BugLenz instance.

| Package | Platform | Status |
|---|---|---|
| `react/` | `@sentry/react` | planned |
| `spring-boot/` | `sentry-spring-boot-starter-jakarta` (Spring Boot 3, Java 21) | planned |

Each wrapper fixes the homologated SDK version, the `release` format (`<app>@<version>`),
`environment`, the standard tags (`cliente`, `tenant`) and a first layer of personal-data
protection (`sendDefaultPii` off, `beforeSend` and `beforeBreadcrumb` filters).

The compatibility matrix (SDK version x instance version) lives in `docs/matriz.md`.

License: MIT.
