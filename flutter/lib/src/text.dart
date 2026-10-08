// Masks CPF, CNPJ, card numbers and e-mail addresses in free text, with the same check-digit rules
// as the instance, so the same text gives the same result on both sides.

const cpfMask = '[cpf]';
const cnpjMask = '[cnpj]';
const cardMask = '[cartao]';
const emailMask = '[email]';

bool _isDigit(int c) => c >= 0x30 && c <= 0x39;
bool _isSep(int c) => c == 0x2e || c == 0x2d || c == 0x2f || c == 0x20; // . - / space
final _alnum = RegExp(r'[\p{L}\p{N}]', unicode: true);
bool _isAlnum(int c) => _alnum.hasMatch(String.fromCharCode(c));

class _Run {
  _Run(this.start, this.end, this.digits, this.groups, this.separators);
  final int start;
  final int end;
  final List<int> digits;
  final List<int> groups;
  final List<int> separators;
}

List<_Run> _findRuns(String text) {
  final cp = text.runes.toList();
  final offset = List<int>.filled(cp.length + 1, 0);
  for (var i = 0; i < cp.length; i++) {
    offset[i + 1] = offset[i] + String.fromCharCode(cp[i]).length;
  }
  final runs = <_Run>[];
  var i = 0;
  while (i < cp.length) {
    if (!_isDigit(cp[i])) {
      i++;
      continue;
    }
    if (i > 0 && _isAlnum(cp[i - 1])) {
      i++;
      while (i < cp.length && _isDigit(cp[i])) {
        i++;
      }
      continue;
    }
    final digits = <int>[];
    final groups = <int>[];
    final separators = <int>[];
    var group = 0;
    var j = i;
    var end = offset[i];
    while (j < cp.length) {
      final ch = cp[j];
      if (_isDigit(ch)) {
        digits.add(ch - 0x30);
        group++;
        end = offset[j + 1];
        j++;
      } else if (_isSep(ch) && j + 1 < cp.length && _isDigit(cp[j + 1]) && group > 0) {
        groups.add(group);
        group = 0;
        separators.add(ch);
        j++;
      } else {
        break;
      }
    }
    groups.add(group);
    final bounded = j >= cp.length || !_isAlnum(cp[j]);
    if (bounded && digits.isNotEmpty) runs.add(_Run(offset[i], end, digits, groups, separators));
    i = j > i ? j : i + 1;
  }
  return runs;
}

bool _sameGroups(List<int> a, List<int> b) =>
    a.length == b.length && List.generate(a.length, (k) => a[k] == b[k]).every((x) => x);

bool _allEqual(List<int> d) => d.every((x) => x == d[0]);

bool _validCpf(List<int> d) {
  if (d.length != 11 || _allEqual(d)) return false;
  int dv(int n) {
    var sum = 0;
    for (var i = 0; i < n; i++) {
      sum += d[i] * (n + 1 - i);
    }
    final r = (sum * 10) % 11;
    return r == 10 ? 0 : r;
  }

  return dv(9) == d[9] && dv(10) == d[10];
}

bool _validCnpj(List<int> d) {
  if (d.length != 14 || _allEqual(d)) return false;
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  int dv(List<int> w) {
    var sum = 0;
    for (var i = 0; i < w.length; i++) {
      sum += d[i] * w[i];
    }
    final r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  }

  return dv(w1) == d[12] && dv(w2) == d[13];
}

bool _luhn(List<int> d) {
  var sum = 0;
  for (var i = 0; i < d.length; i++) {
    var v = d[d.length - 1 - i];
    if (i % 2 == 1) {
      v *= 2;
      if (v > 9) v -= 9;
    }
    sum += v;
  }
  return sum % 10 == 0;
}

bool _only(_Run run, String allowed) =>
    run.separators.every((c) => allowed.contains(String.fromCharCode(c)));

String? _classify(_Run run) {
  final d = run.digits;
  final g = run.groups;
  if (d.length == 11 &&
      _only(run, '.-') &&
      (g.length == 1 || _sameGroups(g, [3, 3, 3, 2]) || _sameGroups(g, [9, 2])) &&
      _validCpf(d)) {
    return cpfMask;
  }
  if (d.length == 14 &&
      _only(run, '.-/') &&
      (g.length == 1 || _sameGroups(g, [2, 3, 3, 4, 2]) || _sameGroups(g, [8, 4, 2])) &&
      _validCnpj(d)) {
    return cnpjMask;
  }
  if (d.length >= 13 &&
      d.length <= 19 &&
      _only(run, ' -') &&
      (g.length == 1 || g.every((x) => x >= 4)) &&
      _luhn(d)) {
    return cardMask;
  }
  return null;
}

String _maskNumbers(String text) {
  final out = StringBuffer();
  var last = 0;
  var changed = false;
  for (final run in _findRuns(text)) {
    final mask = _classify(run);
    if (mask == null) continue;
    out.write(text.substring(last, run.start));
    out.write(mask);
    last = run.end;
    changed = true;
  }
  if (!changed) return text;
  out.write(text.substring(last));
  return out.toString();
}

bool _isLocal(String c) => RegExp(r'[A-Za-z0-9._%+-]').hasMatch(c);
bool _isDomain(String c) => RegExp(r'[A-Za-z0-9.-]').hasMatch(c);

String _maskEmails(String text) {
  final out = StringBuffer();
  var last = 0;
  var changed = false;
  var i = 0;
  while (i < text.length) {
    if (text[i] != '@') {
      i++;
      continue;
    }
    var s = i;
    while (s > 0 && _isLocal(text[s - 1])) {
      s--;
    }
    var e = i + 1;
    while (e < text.length && _isDomain(text[e])) {
      e++;
    }
    while (e > i + 1 && text[e - 1] == '.') {
      e--;
    }
    final local = text.substring(s, i);
    final domain = text.substring(i + 1, e);
    final tld = domain.substring(domain.lastIndexOf('.') + 1);
    if (local.isNotEmpty &&
        domain.contains('.') &&
        tld.length >= 2 &&
        RegExp(r'^[A-Za-z]+$').hasMatch(tld) &&
        s >= last) {
      out.write(text.substring(last, s));
      out.write(emailMask);
      last = e;
      i = e;
      changed = true;
    } else {
      i++;
    }
  }
  if (!changed) return text;
  out.write(text.substring(last));
  return out.toString();
}

/// Masks every recognised value; returns the input itself when there is none.
String maskText(String text) => text.isEmpty ? text : _maskEmails(_maskNumbers(text));
