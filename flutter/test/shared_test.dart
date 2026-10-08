import 'dart:convert';
import 'dart:io';

import 'package:buglenz_flutter/buglenz_flutter.dart';
import 'package:buglenz_flutter/src/scrub_keys.g.dart';
import 'package:flutter_test/flutter_test.dart';

dynamic shared(String file) => jsonDecode(File('../shared/$file').readAsStringSync());

void main() {
  test('the generated rules are the shared list', () {
    final rules = shared('scrub-keys.json') as Map<String, dynamic>;
    expect(scrubExact.toList()..sort(), (rules['exact'] as List).cast<String>());
    expect(scrubContains.toList()..sort(), (rules['contains'] as List).cast<String>());
    expect(identifierExact.toList()..sort(), (rules['identifier']['exact'] as List).cast<String>());
  });

  for (final v in (shared('scrub-vectors.json') as List).cast<Map<String, dynamic>>()) {
    test('key vector ${jsonEncode(v['key'])}', () {
      expect(isDenied(v['key'] as String), v['denied']);
      if (v.containsKey('identifier')) expect(isIdentifier(v['key'] as String), v['identifier']);
    });
  }

  for (final v in (shared('text-vectors.json') as List).cast<Map<String, dynamic>>()) {
    test('text vector ${jsonEncode(v['in'])}', () {
      expect(maskText(v['in'] as String), v['out']);
    });
  }

  test('extra keys extend the exact list', () {
    expect(isDenied('matricula'), isFalse);
    expect(isDenied('Matri-cula', ['matricula']), isTrue);
  });
}
