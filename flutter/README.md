# buglenz_flutter

Thin wrapper around `sentry_flutter` 9.30.1 for apps that report to a BugLenz instance.

```dart
import 'package:buglenz_flutter/buglenz_flutter.dart';

Future<void> main() async {
  await initBugLenz(
    dsn: const String.fromEnvironment('BUGLENZ_DSN'),
    app: 'vendax-mobile',          // release becomes "vendax-mobile@<version>"
    version: '1.4.2+7',            // the pubspec.yaml version; the +build number is allowed
    environment: 'production',
    tenant: 'acme-sp',
    cliente: 'acme',
    appRunner: () => runApp(const MyApp()),
  );
}

await identify(user.id);           // internal id only; e-mail or documents are refused
```

## What it fixes

| Item | Value |
|---|---|
| `release` | `<app>@<version>`; `app` is lowercase letters, digits, `.`, `_`, `-`; the version cannot contain `@` or spaces |
| Collection | `sendDefaultPii` off, no screenshot, no failed-request capture, no request bodies, no tapped-widget breadcrumbs |
| Events | `user` reduced to `id`; the device name, id, unique identifier and exact boot time removed from the device context; `request` to method and URL without query; keys from `shared/scrub-keys.json` replaced by `[Filtered]`; CPF, CNPJ, card numbers and e-mail masked in text; unknown objects filtered |
| Breadcrumbs | typed text and tapped labels dropped; the rest masked |
| Tags | `tenant` and `cliente` added to every event |
| DSN | required; the app fails at startup without it |

The key list and the text masks are the same as the other wrappers' (`shared/`), checked against
`shared/scrub-vectors.json` and `shared/text-vectors.json`. `lib/src/scrub_keys.g.dart` is generated:
`node scripts/sync-flutter-rules.mjs` after changing the shared list.

## Limits

- **Events built by the native layer** (an Android or iOS crash, an ANR) do **not** pass through the Dart
  filters: the Android SDK sends them itself, with whatever the scope holds. They reach the instance with
  the user from the scope, and the instance masks it (layer 2), but the original value did leave the device.
  So: never put an e-mail, a document or an IP address in the scope; use `identify(id)` only.

- **Obfuscated builds** (`--obfuscate --split-debug-info`) and **native crashes** reach the instance
  unreadable: it does not symbolicate them (gap G17).
- The rest of the `contexts` (OS, app, culture, Flutter and Dart runtime) is typed and not inspected; only the device identifiers above are removed.
