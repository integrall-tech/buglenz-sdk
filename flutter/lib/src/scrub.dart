import 'package:sentry_flutter/sentry_flutter.dart';

import 'keys.dart';
import 'text.dart';

const filtered = '[Filtered]';
const _maxDepth = 12;

/// Replaces denied keys and masks personal data in strings, recursively.
Object? scrubValue(Object? value, {Iterable<String> extra = const [], String key = '', int depth = 0}) {
  if (value is String) return isIdentifier(key) ? value : maskText(value);
  if (value == null || value is num || value is bool) return value;
  if (depth >= _maxDepth) return filtered;
  if (value is Map) {
    final out = <String, dynamic>{};
    value.forEach((k, v) {
      final name = k.toString();
      out[name] = isDenied(name, extra) ? filtered : scrubValue(v, extra: extra, key: name, depth: depth + 1);
    });
    return out;
  }
  if (value is Iterable) {
    return value.map((v) => scrubValue(v, extra: extra, key: key, depth: depth + 1)).toList();
  }
  return filtered; // an object that cannot be inspected
}

/// Layer 1 for events: nothing personal leaves the device. Works on the event it is given.
SentryEvent scrubEvent(SentryEvent event, [Iterable<String> extra = const []]) {
  final user = event.user;
  event.user = (user?.id == null) ? null : SentryUser(id: user!.id);

  final request = event.request;
  event.request = (request?.url == null)
      ? null
      : SentryRequest(url: maskText(request!.url!.split('?').first), method: request.method);

  // ignore: deprecated_member_use
  final extras = event.extra;
  if (extras != null) {
    // ignore: deprecated_member_use
    event.extra = (scrubValue(extras, extra: extra) as Map).cast<String, dynamic>();
  }

  final message = event.message;
  if (message != null) {
    message.formatted = maskText(message.formatted);
    message.template = message.template == null ? null : maskText(message.template!);
    message.params = null;
  }

  for (final e in event.exceptions ?? const <SentryException>[]) {
    // Stack frames are code, not user data: masking their text would only corrupt them.
    if (e.value != null) e.value = maskText(e.value!);
  }

  final tags = event.tags;
  if (tags != null) {
    event.tags = {
      for (final entry in tags.entries)
        entry.key: isDenied(entry.key, extra) ? filtered : maskText(entry.value),
    };
  }

  _scrubDevice(event.contexts.device);

  final crumbs = event.breadcrumbs;
  if (crumbs != null) {
    event.breadcrumbs = [
      for (final c in crumbs)
        if (scrubBreadcrumb(c, extra) != null) c,
    ];
  }
  return event;
}

/// Layer 1 for breadcrumbs: typed text and tapped labels are dropped, the rest is masked.
Breadcrumb? scrubBreadcrumb(Breadcrumb? crumb, [Iterable<String> extra = const []]) {
  if (crumb == null) return null;
  if (crumb.category == 'ui.input' || crumb.category == 'ui.click') return null;
  if (crumb.message != null) crumb.message = maskText(crumb.message!);
  final data = crumb.data;
  if (data != null) {
    crumb.data = (scrubValue(data, extra: extra) as Map).cast<String, dynamic>();
  }
  return crumb;
}

/// The device context carries identifiers that follow one phone around (an id, a unique
/// identifier, the exact boot time, a user-chosen name). They are not needed to read an error.
void _scrubDevice(SentryDevice? device) {
  if (device == null) return;
  device.name = null;
  device.deviceUniqueIdentifier = null;
  device.bootTime = null;
  // The native layer adds an `id` the typed class does not model; it travels in `unknown`.
  // `unknown` is marked internal by the SDK; the dependency is pinned to one version for this.
  // ignore: invalid_use_of_internal_member
  final extra = device.unknown;
  if (extra != null) {
    try {
      extra.remove('id');
    } on UnsupportedError {
      // an unmodifiable map: nothing the wrapper can do here
    }
  }
}
