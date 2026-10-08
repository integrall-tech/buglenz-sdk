package com.integrall.buglenz;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;

/** Which keys hold personal data. Loaded from the list shared with every wrapper. */
public final class ScrubRules {

    private static final ScrubRules SHARED = load();

    private final String separators;
    private final Set<String> exact;
    private final List<String> contains;
    private final List<String[]> containsExcept = new ArrayList<>();
    private final List<String> identifierSuffix;
    private final Set<String> identifierExact;

    private ScrubRules(JsonNode json) {
        this.separators = String.join("", strings(json.get("separators")));
        this.exact = new TreeSet<>(strings(json.get("exact")));
        this.contains = strings(json.get("contains"));
        json.get("containsExcept").fields().forEachRemaining(e -> {
            for (String except : strings(e.getValue())) {
                containsExcept.add(new String[] {e.getKey(), except});
            }
        });
        this.identifierSuffix = strings(json.get("identifier").get("suffix"));
        this.identifierExact = new TreeSet<>(strings(json.get("identifier").get("exact")));
    }

    public static ScrubRules shared() {
        return SHARED;
    }

    private static ScrubRules load() {
        try (InputStream in = ScrubRules.class.getResourceAsStream("/buglenz-scrub-keys.json")) {
            if (in == null) throw new IllegalStateException("buglenz-scrub-keys.json is missing from the classpath");
            return new ScrubRules(new ObjectMapper().readTree(in));
        } catch (IOException e) {
            throw new IllegalStateException("buglenz-scrub-keys.json cannot be read", e);
        }
    }

    private static List<String> strings(JsonNode array) {
        List<String> out = new ArrayList<>();
        array.forEach(n -> out.add(n.asText()));
        return out;
    }

    /** Lowercase, without the separators people disagree about. */
    public String normalise(String key) {
        StringBuilder sb = new StringBuilder(key.length());
        key.codePoints().filter(c -> separators.indexOf(c) < 0).forEach(sb::appendCodePoint);
        return sb.toString().toLowerCase(Locale.ROOT);
    }

    public boolean isDenied(String key) {
        return isDenied(key, List.of());
    }

    /** Whether the value under this key must be replaced; {@code extra} adds exact keys per app. */
    public boolean isDenied(String key, Collection<String> extra) {
        String k = normalise(key);
        if (k.isEmpty()) return false;
        if (exact.contains(k) || extra.stream().anyMatch(e -> normalise(e).equals(k))) return true;
        for (String needle : contains) {
            if (!k.contains(needle)) continue;
            boolean excepted = containsExcept.stream().anyMatch(p -> p[0].equals(needle) && k.contains(p[1]));
            if (!excepted) return true;
        }
        return false;
    }

    /** Keys that hold identifiers or timestamps, never free text: the masks skip them. */
    public boolean isIdentifier(String key) {
        String k = normalise(key);
        return identifierSuffix.stream().anyMatch(k::endsWith) || identifierExact.contains(k);
    }
}
