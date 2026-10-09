package com.integrall.buglenz;

import static org.assertj.core.api.Assertions.assertThat;

import io.sentry.Breadcrumb;
import io.sentry.SentryEvent;
import io.sentry.SentryLevel;
import io.sentry.protocol.SentryId;
import io.sentry.protocol.SentrySpan;
import io.sentry.protocol.SentryTransaction;
import io.sentry.SpanId;
import io.sentry.protocol.Message;
import io.sentry.protocol.Request;
import io.sentry.protocol.SentryException;
import io.sentry.protocol.User;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ScrubberTest {

    private final Scrubber scrubber = new Scrubber(ScrubRules.shared(), List.of());

    @Test
    void removesPersonalDataFromAnEvent() {
        SentryEvent event = new SentryEvent();
        User user = new User();
        user.setId("u-42");
        user.setEmail("ana@example.com");
        user.setIpAddress("1.2.3.4");
        event.setUser(user);
        Request request = new Request();
        request.setUrl("https://api.test/pay?token=abc");
        request.setMethod("POST");
        request.setHeaders(Map.of("Authorization", "Bearer x"));
        request.setCookies("a=b");
        request.setData("{\"cpf\":\"529.982.247-25\"}");
        event.setRequest(request);
        event.setExtra("password", "hunter2");
        event.setExtra("note", "mail ana@example.com");
        event.setTag("cliente", "acme");
        Message message = new Message();
        message.setMessage("pedido recusado para cpf 529.982.247-25 (ana@example.com)");
        event.setMessage(message);
        SentryException ex = new SentryException();
        ex.setValue("falhou para ana@example.com");
        event.setExceptions(List.of(ex));
        Breadcrumb crumb = Breadcrumb.info("checkout started for ana@example.com");
        crumb.setData("token", "abc");
        event.setBreadcrumbs(List.of(crumb));

        SentryEvent out = scrubber.event(event);

        assertThat(out.getUser().getId()).isEqualTo("u-42");
        assertThat(out.getUser().getEmail()).isNull();
        assertThat(out.getUser().getIpAddress()).isNull();
        assertThat(out.getRequest().getUrl()).isEqualTo("https://api.test/pay");
        assertThat(out.getRequest().getMethod()).isEqualTo("POST");
        assertThat(out.getRequest().getHeaders()).isNull();
        assertThat(out.getRequest().getCookies()).isNull();
        assertThat(out.getRequest().getData()).isNull();
        assertThat(out.getExtras()).containsEntry("password", "[Filtered]").containsEntry("note", "mail [email]");
        assertThat(out.getTags()).containsEntry("cliente", "acme");
        assertThat(out.getMessage().getMessage()).isEqualTo("pedido recusado para cpf [cpf] ([email])");
        assertThat(out.getExceptions().get(0).getValue()).isEqualTo("falhou para [email]");
        assertThat(out.getBreadcrumbs().get(0).getMessage()).isEqualTo("checkout started for [email]");
        assertThat(out.getBreadcrumbs().get(0).getData()).containsEntry("token", "[Filtered]");
    }

    @Test
    void keepsIdentifiersAndDropsUnknownObjects() {
        Map<String, Object> data = new HashMap<>();
        data.put("span_id", "4111111111111111");
        data.put("opaque", new Object());
        Object out = scrubber.value(data, "", 0);
        assertThat(out).isEqualTo(Map.of("span_id", "4111111111111111", "opaque", "[Filtered]"));
    }

    @Test
    void dropsTypedTextBreadcrumbs() {
        Breadcrumb typed = new Breadcrumb();
        typed.setCategory("ui.input");
        typed.setMessage("ana@example.com");
        typed.setLevel(SentryLevel.INFO);
        assertThat(scrubber.breadcrumb(typed)).isNull();
    }

    @Test
    void userWithoutIdIsRemoved() {
        SentryEvent event = new SentryEvent();
        User user = new User();
        user.setEmail("ana@example.com");
        event.setUser(user);
        assertThat(scrubber.event(event).getUser()).isNull();
    }

    // ---- audit of 2026-10-09 (invariant I4): ids, URLs, contexts and transactions ----

    @Test
    void anEmailTheSdkPutInTheUserIdIsMasked() {
        SentryEvent event = new SentryEvent();
        User user = new User();
        user.setId("ana@example.com");
        event.setUser(user);
        assertThat(scrubber.event(event).getUser().getId()).isEqualTo("[email]");
    }

    @Test
    void theRequestUrlLosesItsQueryAndItsFragment() {
        SentryEvent event = new SentryEvent();
        Request request = new Request();
        request.setUrl("https://a.example.com/p?x=1#access_token=abc");
        request.setMethod("GET");
        event.setRequest(request);
        assertThat(scrubber.event(event).getRequest().getUrl()).isEqualTo("https://a.example.com/p");
    }

    @Test
    void customContextsAreFilteredLikeExtras() {
        SentryEvent event = new SentryEvent();
        Map<String, Object> checkout = new HashMap<>();
        checkout.put("password", "hunter2");
        checkout.put("nota", "contato ana@example.com");
        event.getContexts().put("checkout", checkout);
        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) scrubber.event(event).getContexts().get("checkout");
        assertThat(out).containsEntry("password", "[Filtered]").containsEntry("nota", "contato [email]");
    }

    @Test
    void aTransactionIsFilteredToo() {
        SentryId trace = new SentryId();
        SentrySpan span = new SentrySpan(
                1.0, 2.0, trace, new SpanId(), null, "http.client",
                "GET /api/clientes/ana@example.com?x=1", null, null, new HashMap<>(), new HashMap<>(),
                new HashMap<>(Map.of("password", "hunter2")));
        List<SentrySpan> spans = new java.util.ArrayList<>(List.of(span));
        SentryTransaction tx = new SentryTransaction("/clientes", 1.0, 2.0, spans, new HashMap<>(), new io.sentry.protocol.TransactionInfo("route"));
        User user = new User();
        user.setId("u-1");
        user.setEmail("ana@example.com");
        tx.setUser(user);
        Request request = new Request();
        request.setUrl("https://a.example.com/c?token=abc#t");
        request.setHeaders(Map.of("Cookie", "a=b"));
        tx.setRequest(request);

        SentryTransaction clean = scrubber.transaction(tx);

        assertThat(clean.getUser().getEmail()).isNull();
        assertThat(clean.getUser().getId()).isEqualTo("u-1");
        assertThat(clean.getRequest().getUrl()).isEqualTo("https://a.example.com/c");
        assertThat(clean.getRequest().getHeaders()).isNull();
        SentrySpan cleanSpan = clean.getSpans().get(0);
        assertThat(cleanSpan.getDescription()).isEqualTo("GET /api/clientes/[email]?x=1");
        assertThat(cleanSpan.getData()).containsEntry("password", "[Filtered]");
        assertThat(cleanSpan.getSpanId()).isEqualTo(span.getSpanId());
    }
}
