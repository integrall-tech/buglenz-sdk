package com.integrall.buglenz;

import java.util.ArrayList;
import java.util.List;

/**
 * Masks CPF, CNPJ, card numbers and e-mail addresses in free text, with the same check-digit rules
 * as the instance, so the same text gives the same result on both sides.
 */
public final class TextMasker {

    public static final String CPF = "[cpf]";
    public static final String CNPJ = "[cnpj]";
    public static final String CARD = "[cartao]";
    public static final String EMAIL = "[email]";

    private TextMasker() {}

    /** Masks every recognised value; returns the input itself when there is none. */
    public static String mask(String text) {
        if (text == null || text.isEmpty()) return text;
        return maskEmails(maskNumbers(text));
    }

    private static boolean isAlnum(int c) {
        return Character.isLetterOrDigit(c);
    }

    private static boolean isDigit(int c) {
        return c >= '0' && c <= '9';
    }

    private static boolean isSep(int c) {
        return c == '.' || c == '-' || c == '/' || c == ' ';
    }

    private record Run(int start, int end, int[] digits, List<Integer> groups, List<Integer> separators) {}

    private static List<Run> findRuns(String text) {
        int[] cp = text.codePoints().toArray();
        int[] offset = new int[cp.length + 1];
        for (int i = 0; i < cp.length; i++) offset[i + 1] = offset[i] + Character.charCount(cp[i]);
        List<Run> runs = new ArrayList<>();
        int i = 0;
        while (i < cp.length) {
            if (!isDigit(cp[i])) {
                i++;
                continue;
            }
            if (i > 0 && isAlnum(cp[i - 1])) {
                i++;
                while (i < cp.length && isDigit(cp[i])) i++;
                continue;
            }
            List<Integer> digits = new ArrayList<>();
            List<Integer> groups = new ArrayList<>();
            List<Integer> separators = new ArrayList<>();
            int group = 0;
            int j = i;
            int end = offset[i];
            while (j < cp.length) {
                int ch = cp[j];
                if (isDigit(ch)) {
                    digits.add(ch - '0');
                    group++;
                    end = offset[j + 1];
                    j++;
                } else if (isSep(ch) && j + 1 < cp.length && isDigit(cp[j + 1]) && group > 0) {
                    groups.add(group);
                    group = 0;
                    separators.add(ch);
                    j++;
                } else {
                    break;
                }
            }
            groups.add(group);
            boolean bounded = j >= cp.length || !isAlnum(cp[j]);
            if (bounded && !digits.isEmpty()) {
                runs.add(new Run(offset[i], end, digits.stream().mapToInt(Integer::intValue).toArray(), groups, separators));
            }
            i = Math.max(j, i + 1);
        }
        return runs;
    }

    private static boolean only(Run run, String allowed) {
        return run.separators().stream().allMatch(c -> allowed.indexOf(c) >= 0);
    }

    private static String classify(Run run) {
        int[] d = run.digits();
        List<Integer> g = run.groups();
        if (d.length == 11 && only(run, ".-") && (g.size() == 1 || g.equals(List.of(3, 3, 3, 2)) || g.equals(List.of(9, 2))) && validCpf(d)) {
            return CPF;
        }
        if (d.length == 14 && only(run, ".-/") && (g.size() == 1 || g.equals(List.of(2, 3, 3, 4, 2)) || g.equals(List.of(8, 4, 2))) && validCnpj(d)) {
            return CNPJ;
        }
        if (d.length >= 13 && d.length <= 19 && only(run, " -") && (g.size() == 1 || g.stream().allMatch(x -> x >= 4)) && luhn(d)) {
            return CARD;
        }
        return null;
    }

    private static boolean allEqual(int[] d) {
        for (int x : d) if (x != d[0]) return false;
        return true;
    }

    private static boolean validCpf(int[] d) {
        if (d.length != 11 || allEqual(d)) return false;
        return cpfDigit(d, 9) == d[9] && cpfDigit(d, 10) == d[10];
    }

    private static int cpfDigit(int[] d, int n) {
        int sum = 0;
        for (int i = 0; i < n; i++) sum += d[i] * (n + 1 - i);
        int r = (sum * 10) % 11;
        return r == 10 ? 0 : r;
    }

    private static final int[] W1 = {5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2};
    private static final int[] W2 = {6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2};

    private static boolean validCnpj(int[] d) {
        if (d.length != 14 || allEqual(d)) return false;
        return cnpjDigit(d, W1) == d[12] && cnpjDigit(d, W2) == d[13];
    }

    private static int cnpjDigit(int[] d, int[] w) {
        int sum = 0;
        for (int i = 0; i < w.length; i++) sum += d[i] * w[i];
        int r = sum % 11;
        return r < 2 ? 0 : 11 - r;
    }

    private static boolean luhn(int[] d) {
        int sum = 0;
        for (int i = 0; i < d.length; i++) {
            int v = d[d.length - 1 - i];
            if (i % 2 == 1) {
                v *= 2;
                if (v > 9) v -= 9;
            }
            sum += v;
        }
        return sum % 10 == 0;
    }

    private static String maskNumbers(String text) {
        StringBuilder out = null;
        int last = 0;
        for (Run run : findRuns(text)) {
            String mask = classify(run);
            if (mask == null) continue;
            if (out == null) out = new StringBuilder(text.length());
            out.append(text, last, run.start()).append(mask);
            last = run.end();
        }
        if (out == null) return text;
        return out.append(text, last, text.length()).toString();
    }

    private static boolean isLocal(char c) {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || "._%+-".indexOf(c) >= 0;
    }

    private static boolean isDomain(char c) {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '.' || c == '-';
    }

    private static String maskEmails(String text) {
        StringBuilder out = null;
        int last = 0;
        int i = 0;
        while (i < text.length()) {
            if (text.charAt(i) != '@') {
                i++;
                continue;
            }
            int s = i;
            while (s > 0 && isLocal(text.charAt(s - 1))) s--;
            int e = i + 1;
            while (e < text.length() && isDomain(text.charAt(e))) e++;
            while (e > i + 1 && text.charAt(e - 1) == '.') e--;
            String local = text.substring(s, i);
            String domain = text.substring(i + 1, e);
            String tld = domain.substring(domain.lastIndexOf('.') + 1);
            if (!local.isEmpty() && domain.contains(".") && tld.length() >= 2 && tld.chars().allMatch(c -> (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) && s >= last) {
                if (out == null) out = new StringBuilder(text.length());
                out.append(text, last, s).append(EMAIL);
                last = e;
                i = e;
            } else {
                i++;
            }
        }
        if (out == null) return text;
        return out.append(text, last, text.length()).toString();
    }
}
