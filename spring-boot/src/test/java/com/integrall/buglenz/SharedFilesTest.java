package com.integrall.buglenz;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

class SharedFilesTest {

    private static final Path SHARED = Path.of("..", "shared");
    private static final ObjectMapper JSON = new ObjectMapper();

    static Stream<JsonNode> keyVectors() throws IOException {
        return Stream.of(JSON.readTree(SHARED.resolve("scrub-vectors.json").toFile())).flatMap(a -> stream(a));
    }

    static Stream<JsonNode> textVectors() throws IOException {
        return Stream.of(JSON.readTree(SHARED.resolve("text-vectors.json").toFile())).flatMap(a -> stream(a));
    }

    static Stream<JsonNode> urlVectors() throws IOException {
        return Stream.of(JSON.readTree(SHARED.resolve("url-vectors.json").toFile())).flatMap(a -> stream(a));
    }

    static Stream<JsonNode> idVectors() throws IOException {
        return Stream.of(JSON.readTree(SHARED.resolve("id-vectors.json").toFile())).flatMap(a -> stream(a));
    }

    private static Stream<JsonNode> stream(JsonNode array) {
        return java.util.stream.StreamSupport.stream(array.spliterator(), false);
    }

    @Test
    void packagedKeyListIsTheSharedOne() throws IOException {
        String shared = Files.readString(SHARED.resolve("scrub-keys.json"));
        String packaged = Files.readString(Path.of("src", "main", "resources", "buglenz-scrub-keys.json"));
        assertThat(packaged).isEqualTo(shared);
    }

    @ParameterizedTest
    @MethodSource("keyVectors")
    void keyVector(JsonNode v) {
        ScrubRules rules = ScrubRules.shared();
        assertThat(rules.isDenied(v.get("key").asText())).as(v.toString()).isEqualTo(v.get("denied").asBoolean());
        if (v.has("identifier")) {
            assertThat(rules.isIdentifier(v.get("key").asText())).as(v.toString()).isEqualTo(v.get("identifier").asBoolean());
        }
    }

    @ParameterizedTest
    @MethodSource("textVectors")
    void textVector(JsonNode v) {
        assertThat(TextMasker.mask(v.get("in").asText())).as(v.toString()).isEqualTo(v.get("out").asText());
    }

    @Test
    void extraKeysExtendTheExactList() {
        assertThat(ScrubRules.shared().isDenied("matricula")).isFalse();
        assertThat(ScrubRules.shared().isDenied("Matri-cula", java.util.List.of("matricula"))).isTrue();
    }

    @ParameterizedTest
    @MethodSource("urlVectors")
    void urlVector(JsonNode v) {
        assertThat(TextMasker.stripUrl(v.get("in").asText())).as(v.toString()).isEqualTo(v.get("out").asText());
    }

    @ParameterizedTest
    @MethodSource("idVectors")
    void idVector(JsonNode v) {
        assertThat(TextMasker.maskEmails(v.get("in").asText())).as(v.toString()).isEqualTo(v.get("out").asText());
    }
}
