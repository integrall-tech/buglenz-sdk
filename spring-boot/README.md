# buglenz-spring-boot-starter

Thin wrapper around `sentry-spring-boot-starter-jakarta` 8.60.0 (Spring Boot 3, Java 21) for apps
that report to a BugLenz instance.

```xml
<dependency>
  <groupId>com.integrall.buglenz</groupId>
  <artifactId>buglenz-spring-boot-starter</artifactId>
  <version>0.1.0</version>
</dependency>
```

```properties
buglenz.dsn=${BUGLENZ_DSN}
buglenz.app=vendax-api              # release becomes "vendax-api@<version>"
buglenz.version=@project.version@   # filtered by Maven
buglenz.environment=production
buglenz.tenant=acme-sp
buglenz.cliente=acme
# buglenz.extra-denied-keys=matricula,codigo-interno
```

## What it fixes

| Item | Value |
|---|---|
| `release` | `<app>@<version>`; `app` is lowercase letters, digits, `.`, `_`, `-` |
| Starter properties | `sentry.dsn`, `sentry.release`, `sentry.environment`, tags and `sentry.send-default-pii=false` are written from `buglenz.*` with the highest precedence; the app cannot override them |
| Events | `user` reduced to `id`; `request` reduced to method and URL without query; keys from `shared/scrub-keys.json` replaced by `[Filtered]`; CPF, CNPJ, card numbers and e-mail masked in the message, exceptions, extras, tags and breadcrumbs; objects that cannot be inspected are filtered |
| Sessions | never started. The Java SDK sends nothing unless asked, and a repeated terminal update for one session is counted twice by the instance (gap G24) |
| Startup | fails when `buglenz.environment` is `production` and `buglenz.dsn` is missing; names the property missing when the DSN is set but `app`, `version` or `environment` is not |

Without `buglenz.dsn` outside production the starter stays inactive.

## Known limits

- The `contexts` of an event are not inspected (they are typed objects such as OS and device).
- A `beforeSend` set by the app runs after the wrapper's filter, so it sees clean events.
