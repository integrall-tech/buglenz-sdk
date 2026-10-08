package com.integrall.buglenz;

import static org.assertj.core.api.Assertions.assertThat;

import io.sentry.Breadcrumb;
import io.sentry.SentryEvent;
import io.sentry.SentryLevel;
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
}
