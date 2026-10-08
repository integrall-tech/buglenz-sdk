import 'scrub_keys.g.dart';

/// Lowercase, without the separators people disagree about.
String normalise(String key) {
  final buffer = StringBuffer();
  for (final rune in key.runes) {
    final c = String.fromCharCode(rune);
    if (!scrubSeparators.contains(c)) buffer.write(c);
  }
  return buffer.toString().toLowerCase();
}

/// Whether the value under this key must be replaced; [extra] adds exact keys per app.
bool isDenied(String key, [Iterable<String> extra = const []]) {
  final k = normalise(key);
  if (k.isEmpty) return false;
  if (scrubExact.contains(k) || extra.any((e) => normalise(e) == k)) return true;
  for (final needle in scrubContains) {
    if (!k.contains(needle)) continue;
    final excepted = (scrubContainsExcept[needle] ?? const <String>[]).any(k.contains);
    if (!excepted) return true;
  }
  return false;
}

/// Keys that hold identifiers or timestamps, never free text: the masks skip them.
bool isIdentifier(String key) {
  final k = normalise(key);
  return identifierSuffix.any(k.endsWith) || identifierExact.contains(k);
}
