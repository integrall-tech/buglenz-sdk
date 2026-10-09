import 'dart:convert';

import 'package:buglenz_flutter/buglenz_flutter.dart';
import 'package:flutter_test/flutter_test.dart';
// ignore: depend_on_referenced_packages, implementation_imports
import 'package:sentry/src/sentry_tracer.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

void configure(SentryFlutterOptions o, {String env = 'homolog', String dsn = 'http://k@localhost:1/1', String app = 'vendax-mobile', String version = '1.4.2+7'}) {
  configureBugLenz(o, dsn: dsn, app: app, version: version, environment: env, tenant: 't1', cliente: 'acme');
}

void main() {
  group('configureBugLenz', () {
    test('builds the release, turns collection off and keeps the + of pubspec', () {
      final o = SentryFlutterOptions();
      configure(o);
      expect(o.release, 'vendax-mobile@1.4.2+7');
      expect(o.environment, 'homolog');
      expect(o.sendDefaultPii, isFalse);
      expect(o.attachScreenshot, isFalse);
      expect(o.enableUserInteractionBreadcrumbs, isFalse);
      expect(o.captureFailedRequests, isFalse);
      expect(o.maxRequestBodySize, MaxRequestBodySize.never);
    });

    test('fails visibly without a DSN or with a bad app or version', () {
      expect(() => configure(SentryFlutterOptions(), dsn: ''), throwsArgumentError);
      expect(() => configure(SentryFlutterOptions(), app: 'Vendax Mobile'), throwsArgumentError);
      expect(() => releaseOf('app', '1.0@x'), throwsArgumentError);
      expect(() => releaseOf('app', ''), throwsArgumentError);
    });

    test('adds the tenant and cliente tags to every event and filters it', () async {
      final o = SentryFlutterOptions();
      configure(o);
      final event = SentryEvent(
        user: SentryUser(id: 'u-42', email: 'ana@example.com', ipAddress: '1.2.3.4'),
        message: SentryMessage('pedido recusado para cpf 529.982.247-25 (ana@example.com)'),
        tags: {'nota': 'contato ana@example.com'},
      );
      final out = (await o.beforeSend!(event, Hint()))!;
      expect(out.user!.id, 'u-42');
      expect(out.user!.email, isNull);
      expect(out.user!.ipAddress, isNull);
      expect(out.tags, {'nota': 'contato [email]', 'tenant': 't1', 'cliente': 'acme'});
      expect(out.message!.formatted, 'pedido recusado para cpf [cpf] ([email])');
    });

    test('filters the custom contexts an app sets, not only extra', () async {
      final o = SentryFlutterOptions();
      configure(o);
      final event = SentryEvent();
      event.contexts['checkout'] = {'password': 'hunter2', 'nota': 'contato ana@example.com', 'itens': 3};
      final out = (await o.beforeSend!(event, Hint()))!;
      expect(out.contexts['checkout'], {'password': '[Filtered]', 'nota': 'contato [email]', 'itens': 3});
    });

    test('the filtered event still serializes, with the SDK\'s own contexts intact', () async {
      final o = SentryFlutterOptions();
      configure(o);
      final event = SentryEvent();
      event.contexts.runtimes = [SentryRuntime(name: 'Dart', version: '3.11')];
      event.contexts['checkout'] = {'password': 'hunter2'};
      final out = (await o.beforeSend!(event, Hint()))!;
      // What the SDK does when it builds the envelope: an exception here drops the event.
      final json = jsonEncode(out.toJson());
      expect(json, contains('"runtime":{"name":"Dart"'));
      expect(json, isNot(contains('hunter2')));
    });

    // ---- audit of 2026-10-09 (invariant I4): ids, URLs and transactions ----

    test('masks an e-mail the SDK put in user.id and keeps an ordinary id', () async {
      final o = SentryFlutterOptions();
      configure(o);
      final out = (await o.beforeSend!(SentryEvent(user: SentryUser(id: 'ana@example.com')), Hint()))!;
      expect(out.user!.id, '[email]');
      final plain = (await o.beforeSend!(SentryEvent(user: SentryUser(id: 'u-42')), Hint()))!;
      expect(plain.user!.id, 'u-42');
    });

    test('drops the query string and the fragment of the request url', () async {
      final o = SentryFlutterOptions();
      configure(o);
      final event = SentryEvent(request: SentryRequest(url: 'https://a.example.com/p?x=1#access_token=abc', method: 'GET'));
      final out = (await o.beforeSend!(event, Hint()))!;
      expect(out.request!.url, 'https://a.example.com/p');
    });

    test('masks an e-mail under a key that ends in id and leaves other ids alone', () {
      final out = scrubValue({'customer_id': 'ana@example.com', 'order_id': '4111111111111111'}) as Map;
      expect(out, {'customer_id': '[email]', 'order_id': '4111111111111111'});
    });

    test('strips the urls inside breadcrumbs', () {
      final crumb = scrubBreadcrumb(Breadcrumb(category: 'navigation', data: {'from': '/a?x=1#t', 'to': '/b/ana@example.com#t'}))!;
      expect(crumb.data, {'from': '/a', 'to': '/b/[email]'});
    });

    test('installs a transaction filter that cleans the transaction and its spans', () async {
      final o = SentryFlutterOptions();
      configure(o);
      expect(o.beforeSendTransaction, isNotNull);
      o.tracesSampleRate = 1.0; // tracing is off by default; an app can switch it on, and then this filter runs
      // ignore: invalid_use_of_internal_member
      final tracer = Hub(o).startTransaction('/clientes', 'ui.load', bindToScope: false) as SentryTracer;
      final span = tracer.startChild('http.client', description: 'GET /api/clientes/ana@example.com?x=1');
      span.setData('password', 'hunter2');
      span.setTag('nota', 'contato ana@example.com');
      await span.finish();
      await tracer.finish();
      final tx = SentryTransaction(tracer, user: SentryUser(id: 'u-1', email: 'ana@example.com'));
      final out = (await o.beforeSendTransaction!(tx, Hint()))!;
      expect(out.user!.email, isNull);
      expect(out.user!.id, 'u-1');
      expect(out.spans.single.context.description, 'GET /api/clientes/[email]?x=1');
      expect(out.spans.single.data['password'], '[Filtered]');
      expect(out.spans.single.tags['nota'], 'contato [email]');
    });

    test('a beforeSend of the app runs after the filter and sees a clean event', () async {
      final o = SentryFlutterOptions();
      configureBugLenz(o, dsn: 'http://k@h/1', app: 'a', version: '1', environment: 'e',
          beforeSend: (e, h) { expect(e.user?.email, isNull); return e; });
      await o.beforeSend!(SentryEvent(user: SentryUser(id: 'u', email: 'a@b.com')), Hint());
    });
  });

  group('layer 1 filters', () {
    test('removes personal data from an event', () {
      final event = SentryEvent(
        request: SentryRequest(url: 'https://app.test/pay?token=abc', method: 'POST', cookies: 'a=b'),
        exceptions: [SentryException(type: 'Error', value: 'falhou para ana@example.com')],
        // ignore: deprecated_member_use
        extra: {'password': 'hunter2', 'note': 'mail ana@example.com', 'span_id': '4111111111111111'},
        breadcrumbs: [
          Breadcrumb(message: 'checkout de ana@example.com', category: 'console'),
          Breadcrumb(message: 'ana@example.com', category: 'ui.input'),
          Breadcrumb(message: 'Botão Ana Silva', category: 'ui.click'),
        ],
      );
      final out = scrubEvent(event);
      expect(out.request!.url, 'https://app.test/pay');
      expect(out.request!.cookies, isNull);
      expect(out.exceptions!.single.value, 'falhou para [email]');
      // ignore: deprecated_member_use
      expect(out.extra, {'password': '[Filtered]', 'note': 'mail [email]', 'span_id': '4111111111111111'});
      expect(out.breadcrumbs!.map((b) => b.message), ['checkout de [email]']);
    });

    test('the device context loses what identifies one phone and keeps what explains an error', () {
      final event = SentryEvent(
        contexts: Contexts(
          device: SentryDevice(
            name: "Tablet da Ana",
            unknown: {'id': 'a643d171d2bd4ac0985fa2c53b2c82ce'},
            deviceUniqueIdentifier: 'uuid-1',
            bootTime: DateTime.utc(2026, 10, 8, 13, 36),
            model: 'SM-X115',
            brand: 'samsung',
            memorySize: 3819933696,
          ),
        ),
      );
      final device = scrubEvent(event).contexts.device!;
      expect(device.name, isNull);
      // ignore: invalid_use_of_internal_member
      expect(device.unknown?.containsKey('id') ?? false, isFalse);
      expect(device.deviceUniqueIdentifier, isNull);
      expect(device.bootTime, isNull);
      expect(device.model, 'SM-X115');
      expect(device.brand, 'samsung');
      expect(device.memorySize, 3819933696);
    });

    test('an unknown object in the data is filtered, not sent', () {
      expect(scrubValue({'x': Object()}), {'x': '[Filtered]'});
    });
  });

  group('identify', () {
    test('refuses e-mail, documents and extra fields outside production', () async {
      configure(SentryFlutterOptions());
      expect(() => identify('ana@example.com'), throwsArgumentError);
      expect(() => identify('529.982.247-25'), throwsArgumentError);
      expect(() => identify('u-1', extraFields: {'email': 'a@b.com'}), throwsArgumentError);
    });
  });
}
