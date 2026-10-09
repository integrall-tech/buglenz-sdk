import 'dart:async';

import 'package:sentry_flutter/sentry_flutter.dart';

import 'keys.dart';
import 'scrub.dart';
import 'text.dart';

final _appName = RegExp(r'^[a-z0-9][a-z0-9._-]*$');

/// `<app>@<version>`, validated: the format every instance and dashboard relies on.
String releaseOf(String app, String version) {
  if (!_appName.hasMatch(app)) {
    throw ArgumentError('BugLenz: "app" must be lowercase letters, digits, ".", "_" or "-" (got "$app")');
  }
  if (version.isEmpty || RegExp(r'[@\s]').hasMatch(version)) {
    throw ArgumentError('BugLenz: "version" is required and cannot contain "@" or spaces');
  }
  return '$app@$version';
}

bool _strict = true;
List<String> _extraKeys = const [];

/// What the wrapper decides on [options]: the release, the environment and everything that keeps
/// personal data on the device. Separate from [initBugLenz] so it can be tested without a platform.
void configureBugLenz(
  SentryFlutterOptions options, {
  required String dsn,
  required String app,
  required String version,
  required String environment,
  String? tenant,
  String? cliente,
  List<String> extraDeniedKeys = const [],
  bool? strict,
  FutureOr<SentryEvent?> Function(SentryEvent event, Hint hint)? beforeSend,
}) {
  if (dsn.isEmpty) {
    throw ArgumentError('BugLenz: "dsn" is required; take it from the project in the instance');
  }
  if (environment.isEmpty) throw ArgumentError('BugLenz: "environment" is required');
  final release = releaseOf(app, version);
  _extraKeys = List.unmodifiable(extraDeniedKeys);
  _strict = strict ?? environment != 'production';

  options
    ..dsn = dsn
    ..release = release
    ..environment = environment
    // The SDK collects by default; here it collects nothing it does not need.
    ..sendDefaultPii = false
    ..attachScreenshot = false
    ..enableUserInteractionBreadcrumbs = false
    ..captureFailedRequests = false
    ..maxRequestBodySize = MaxRequestBodySize.never
    ..beforeSend = (event, hint) async {
      final clean = scrubEvent(event, _extraKeys);
      return beforeSend == null ? clean : await beforeSend(clean, hint);
    }
    ..beforeSendTransaction = ((transaction, hint) => scrubTransaction(transaction, _extraKeys))
    ..beforeBreadcrumb = (crumb, hint) => scrubBreadcrumb(crumb, _extraKeys);

  final tags = <String, String>{
    if (tenant != null && tenant.isNotEmpty) 'tenant': tenant,
    if (cliente != null && cliente.isNotEmpty) 'cliente': cliente,
  };
  if (tags.isNotEmpty) {
    options.beforeSend = _withTags(options.beforeSend!, tags);
  }
}

FutureOr<SentryEvent?> Function(SentryEvent, Hint) _withTags(
  FutureOr<SentryEvent?> Function(SentryEvent, Hint) next,
  Map<String, String> tags,
) {
  return (event, hint) {
    event.tags = {...?event.tags, ...tags};
    return next(event, hint);
  };
}

/// Starts the SDK with the BugLenz settings. Pass the app's `runApp` as [appRunner] to capture
/// errors from the zone and the Flutter framework.
Future<void> initBugLenz({
  required String dsn,
  required String app,
  required String version,
  required String environment,
  String? tenant,
  String? cliente,
  List<String> extraDeniedKeys = const [],
  bool? strict,
  FutureOr<SentryEvent?> Function(SentryEvent event, Hint hint)? beforeSend,
  FutureOr<void> Function()? appRunner,
}) {
  return SentryFlutter.init(
    (options) => configureBugLenz(
      options,
      dsn: dsn,
      app: app,
      version: version,
      environment: environment,
      tenant: tenant,
      cliente: cliente,
      extraDeniedKeys: extraDeniedKeys,
      strict: strict,
      beforeSend: beforeSend,
    ),
    appRunner: appRunner,
  );
}

/// Tells the instance who the user is, by internal id only. E-mail, documents and anything else
/// are refused: they are not needed to group or find errors.
Future<void> identify(String id, {Map<String, Object?> extraFields = const {}}) async {
  final looksPersonal = id.isEmpty || maskText(id) != id || id.contains('@') || isDenied(id);
  if (extraFields.isNotEmpty || looksPersonal) {
    final why = extraFields.isNotEmpty
        ? 'unexpected field(s): ${extraFields.keys.join(', ')}'
        : 'the id is empty or looks like personal data';
    if (_strict) throw ArgumentError('BugLenz: identify() takes an internal id only ($why)');
    // ignore: avoid_print
    print('BugLenz: identify() ignored ($why)');
    return;
  }
  await Sentry.configureScope((scope) => scope.setUser(SentryUser(id: id)));
}

/// Forgets the user (on logout).
Future<void> clearIdentity() async {
  await Sentry.configureScope((scope) => scope.setUser(null));
}
