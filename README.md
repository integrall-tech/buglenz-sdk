# buglenz-sdk

Thin wrappers around the official Sentry SDKs for apps that report errors to a BugLenz instance.

| Package | Platform | Status |
|---|---|---|
| `react/` | `@sentry/react` 11.5.0 | homologated, see `docs/matriz.md` |
| `spring-boot/` | `sentry-spring-boot-starter-jakarta` 8.60.0 (Spring Boot 3, Java 21) | homologated, see `docs/matriz.md` |

Each wrapper fixes the homologated SDK version, the `release` format (`<app>@<version>`),
`environment`, the standard tags (`cliente`, `tenant`) and a first layer of personal-data
protection (`sendDefaultPii` off, `beforeSend` and `beforeBreadcrumb` filters).

The compatibility matrix (SDK version x instance version) lives in `docs/matriz.md`.

License: MIT.

## Personal-data key rules (`shared/`)

`shared/scrub-keys.json` is the single list of keys whose values a wrapper removes before sending
(layer 1). Every platform reproduces the same rules: keys are compared lowercase, without `_`, `-`,
space and `.`; they are denied when they equal an `exact` entry or contain a `contains` entry
(except `tokens`, which is a count). `shared/scrub-vectors.json` holds the cases each platform
implementation must pass; `shared/scrub-keys.mjs` is the reference.

```
npm test                                   # lists and vectors
BUGLENZ_SERVER_KEYS_RS=/path/to/keys.rs npm test   # also compares with the instance's list
```

The comparison fails when the instance's list changes and this one does not.

## Contract tests

`contract/run.sh <instance image> [react|spring|all]` starts the image with PostgreSQL, builds an app
with each wrapper, makes it raise errors containing personal data and asserts, through the instance's
API and on the raw envelopes, what arrived and what left the application. Needs Docker, Node 24 and
access to the image.
