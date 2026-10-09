// What a careless app does anyway: the wrapper must keep it from leaving the device.
//
// Runs with `flutter test` and ships to the instance through the recorder; the DSN comes from the
// BUGLENZ_DSN environment variable. Under `flutter test` there is no platform plugin, so the SDK's
// native transport (a platform-channel call) has nothing to talk to: after `initBugLenz` the probe
// swaps only the transport for one that posts the very same envelope over HTTP. Release, tags,
// filters and what the instance accepts are the wrapper's and the SDK's own.
import 'dart:io';

import 'package:buglenz_flutter/buglenz_flutter.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

/// Posts each envelope the SDK builds, as the Dart transport does.
class HttpEnvelopeTransport implements Transport {
  HttpEnvelopeTransport(this._options);

  final SentryOptions _options;

  @override
  Future<SentryId?> send(SentryEnvelope envelope) async {
    final dsn = _options.parsedDsn;
    final bytes = <int>[];
    await for (final chunk in envelope.envelopeStream(_options)) {
      bytes.addAll(chunk);
    }
    final client = HttpClient();
    try {
      final request = await client.postUrl(dsn.postUri);
      request.headers
        ..set('Content-Type', 'application/x-sentry-envelope')
        ..set('X-Sentry-Auth', 'Sentry sentry_version=7, sentry_client=buglenz-contract/1, sentry_key=${dsn.publicKey}');
      request.add(bytes);
      final response = await request.close();
      await response.drain<void>();
      if (response.statusCode >= 300) {
        throw StateError('the instance answered ${response.statusCode}');
      }
      return envelope.header.eventId;
    } finally {
      client.close(force: true);
    }
  }
}

void main() {
  test('reports a handled and a second error through the wrapper', () async {
    // flutter_test replaces the HTTP client with one that answers 400; this probe needs the real one.
    HttpOverrides.global = null;
    final dsn = Platform.environment['BUGLENZ_DSN'];
    expect(dsn, isNotNull, reason: 'BUGLENZ_DSN is required');

    await initBugLenz(
      dsn: dsn!,
      app: 'contract-mobile',
      version: '1.0.0+1',
      environment: 'homolog',
      tenant: 't1',
      cliente: 'acme',
    );
    final options = Sentry.currentHub.options;
    options.transport = HttpEnvelopeTransport(options);

    // What a careless app does anyway.
    await Sentry.addBreadcrumb(Breadcrumb(message: 'checkout started for ana@example.com'));
    await Sentry.configureScope((scope) async {
      await scope.setUser(SentryUser(id: 'u-42', email: 'ana@example.com', ipAddress: '1.2.3.4'));
      await scope.setTag('nota', 'contato ana@example.com');
      await scope.setContexts('extra', {'password': 'hunter2'});
    });

    try {
      throw StateError('pedido recusado para cpf 529.982.247-25 (ana@example.com)');
    } catch (e, st) {
      await Sentry.captureException(e, stackTrace: st);
    }
    try {
      throw ArgumentError('uncaught in worker');
    } catch (e, st) {
      await Sentry.captureException(e, stackTrace: st);
    }

    await Future<void>.delayed(const Duration(seconds: 2));
    await Sentry.close();
  });
}
