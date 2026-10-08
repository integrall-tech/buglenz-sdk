// Masks CPF, CNPJ, card numbers and e-mail addresses in free text, with the same
// check-digit rules as the instance, so the same text gives the same result on both sides.

export const CPF = '[cpf]';
export const CNPJ = '[cnpj]';
export const CARD = '[cartao]';
export const EMAIL = '[email]';

const isAlnum = (c: string) => /[\p{L}\p{N}]/u.test(c);
const isDigit = (c: string) => c >= '0' && c <= '9';
const isSep = (c: string) => c === '.' || c === '-' || c === '/' || c === ' ';

interface Run {
  start: number;
  end: number;
  digits: number[];
  groups: number[];
  separators: string[];
}

function findRuns(text: string): Run[] {
  const chars = Array.from(text);
  const offsets: number[] = [];
  let at = 0;
  for (const c of chars) {
    offsets.push(at);
    at += c.length;
  }
  offsets.push(at);
  const runs: Run[] = [];
  let i = 0;
  while (i < chars.length) {
    if (!isDigit(chars[i])) {
      i++;
      continue;
    }
    if (i > 0 && isAlnum(chars[i - 1])) {
      i++;
      while (i < chars.length && isDigit(chars[i])) i++;
      continue;
    }
    const digits: number[] = [];
    const groups: number[] = [];
    const separators: string[] = [];
    let group = 0;
    let j = i;
    let end = offsets[i];
    while (j < chars.length) {
      const ch = chars[j];
      if (isDigit(ch)) {
        digits.push(Number(ch));
        group++;
        end = offsets[j + 1];
        j++;
      } else if (isSep(ch) && j + 1 < chars.length && isDigit(chars[j + 1]) && group > 0) {
        groups.push(group);
        group = 0;
        separators.push(ch);
        j++;
      } else break;
    }
    groups.push(group);
    const bounded = j >= chars.length || !isAlnum(chars[j]);
    if (bounded && digits.length > 0) runs.push({ start: offsets[i], end, digits, groups, separators });
    i = Math.max(j, i + 1);
  }
  return runs;
}

const sameGroups = (a: number[], b: number[]) => a.length === b.length && a.every((x, k) => x === b[k]);

function validCpf(d: number[]): boolean {
  if (d.length !== 11 || d.every((x) => x === d[0])) return false;
  const dv = (n: number) => {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += d[i] * (n + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === d[9] && dv(10) === d[10];
}

function validCnpj(d: number[]): boolean {
  if (d.length !== 14 || d.every((x) => x === d[0])) return false;
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, ...w1];
  const dv = (w: number[]) => {
    const r = w.reduce((s, x, i) => s + d[i] * x, 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(w1) === d[12] && dv(w2) === d[13];
}

function luhn(d: number[]): boolean {
  let sum = 0;
  [...d].reverse().forEach((x, i) => {
    let v = x;
    if (i % 2 === 1) {
      v *= 2;
      if (v > 9) v -= 9;
    }
    sum += v;
  });
  return sum % 10 === 0;
}

function classify(run: Run): string | null {
  const d = run.digits;
  const only = (allowed: string) => run.separators.every((c) => allowed.includes(c));
  if (d.length === 11 && only('.-') && (run.groups.length === 1 || sameGroups(run.groups, [3, 3, 3, 2]) || sameGroups(run.groups, [9, 2])) && validCpf(d)) return CPF;
  if (d.length === 14 && only('.-/') && (run.groups.length === 1 || sameGroups(run.groups, [2, 3, 3, 4, 2]) || sameGroups(run.groups, [8, 4, 2])) && validCnpj(d)) return CNPJ;
  if (d.length >= 13 && d.length <= 19 && only(' -') && (run.groups.length === 1 || run.groups.every((g) => g >= 4)) && luhn(d)) return CARD;
  return null;
}

function maskNumbers(text: string): string {
  let out = '';
  let last = 0;
  for (const run of findRuns(text)) {
    const mask = classify(run);
    if (!mask) continue;
    out += text.slice(last, run.start) + mask;
    last = run.end;
  }
  return last === 0 && out === '' ? text : out + text.slice(last);
}

const isLocal = (c: string) => /[A-Za-z0-9._%+-]/.test(c);
const isDomain = (c: string) => /[A-Za-z0-9.-]/.test(c);

function maskEmails(text: string): string {
  let out = '';
  let last = 0;
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '@') {
      i++;
      continue;
    }
    let s = i;
    while (s > 0 && isLocal(text[s - 1])) s--;
    let e = i + 1;
    while (e < text.length && isDomain(text[e])) e++;
    while (e > i + 1 && text[e - 1] === '.') e--;
    const local = text.slice(s, i);
    const domain = text.slice(i + 1, e);
    const tld = domain.split('.').pop() ?? '';
    if (local !== '' && domain.includes('.') && /^[A-Za-z]{2,}$/.test(tld) && s >= last) {
      out += text.slice(last, s) + EMAIL;
      last = e;
      i = e;
    } else i++;
  }
  return last === 0 && out === '' ? text : out + text.slice(last);
}

/** Masks every recognised value in `text`; returns the input itself when there is none. */
export function maskText(text: string): string {
  return maskEmails(maskNumbers(text));
}
