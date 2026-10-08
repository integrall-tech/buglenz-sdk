package com.integrall.buglenz;

import io.sentry.Breadcrumb;
import io.sentry.Hint;
import io.sentry.Sentry;
import io.sentry.SentryEvent;
import io.sentry.protocol.Message;
import io.sentry.protocol.Request;
import io.sentry.protocol.SentryException;
import io.sentry.protocol.User;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Layer 1: nothing personal leaves the JVM. The instance masks again (layer 2). */
public final class Scrubber {

    public static final String FILTERED = "[Filtered]";
    private static final int MAX_DEPTH = 12;

    private final ScrubRules rules;
    private final List<String> extraKeys;

    public Scrubber(ScrubRules rules, List<String> extraKeys) {
        this.rules = rules;
        this.extraKeys = List.copyOf(extraKeys);
    }

    /** Replaces denied keys and masks personal data in strings, recursively. */
    public Object value(Object value, String key, int depth) {
        if (value instanceof CharSequence text) {
            return rules.isIdentifier(key) ? text.toString() : TextMasker.mask(text.toString());
        }
        if (value == null || value instanceof Number || value instanceof Boolean) return value;
        if (depth >= MAX_DEPTH) return FILTERED;
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> out = new LinkedHashMap<>();
            map.forEach((k, v) -> {
                String name = String.valueOf(k);
                out.put(name, rules.isDenied(name, extraKeys) ? FILTERED : value(v, name, depth + 1));
            });
            return out;
        }
        if (value instanceof Collection<?> items) {
            List<Object> out = new ArrayList<>();
            items.forEach(v -> out.add(value(v, key, depth + 1)));
            return out;
        }
        return FILTERED; // unknown object: its content cannot be checked
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> map(Map<String, ?> input) {
        return (Map<String, Object>) value(input, "", 0);
    }

    public SentryEvent event(SentryEvent event) {
        User user = event.getUser();
        event.setUser(null);
        if (user != null && user.getId() != null) {
            User only = new User();
            only.setId(user.getId());
            event.setUser(only);
        }

        Request request = event.getRequest();
        event.setRequest(null);
        if (request != null && request.getUrl() != null) {
            Request clean = new Request();
            clean.setUrl(TextMasker.mask(request.getUrl().split("\\?", 2)[0]));
            clean.setMethod(request.getMethod());
            event.setRequest(clean);
        }

        Map<String, Object> extras = event.getExtras();
        if (extras != null) event.setExtras(map(extras));

        Message message = event.getMessage();
        if (message != null) {
            message.setMessage(TextMasker.mask(message.getMessage()));
            message.setFormatted(TextMasker.mask(message.getFormatted()));
            message.setParams(null);
        }

        List<SentryException> exceptions = event.getExceptions();
        if (exceptions != null) {
            // Stack frames are code, not user data: masking their text would only corrupt them.
            exceptions.forEach(e -> e.setValue(TextMasker.mask(e.getValue())));
        }

        Map<String, String> tags = event.getTags();
        if (tags != null) {
            Map<String, String> clean = new HashMap<>();
            tags.forEach((k, v) -> clean.put(k, rules.isDenied(k, extraKeys) ? FILTERED : TextMasker.mask(v)));
            event.setTags(clean);
        }

        List<Breadcrumb> crumbs = event.getBreadcrumbs();
        if (crumbs != null) {
            List<Breadcrumb> clean = new ArrayList<>();
            crumbs.forEach(c -> {
                Breadcrumb b = breadcrumb(c);
                if (b != null) clean.add(b);
            });
            event.setBreadcrumbs(clean);
        }
        return event;
    }

    public Breadcrumb breadcrumb(Breadcrumb crumb) {
        if ("ui.input".equals(crumb.getCategory())) return null;
        crumb.setMessage(TextMasker.mask(crumb.getMessage()));
        Map<String, Object> data = new HashMap<>(crumb.getData());
        Map<String, Object> clean = map(data);
        data.keySet().forEach(crumb::removeData);
        clean.forEach(crumb::setData);
        return crumb;
    }

    /** Installs both callbacks on the options, running {@code next} (if any) after the filter. */
    public void install(io.sentry.SentryOptions options) {
        io.sentry.SentryOptions.BeforeSendCallback next = options.getBeforeSend();
        options.setBeforeSend((SentryEvent event, Hint hint) -> {
            SentryEvent clean = event(event);
            return next == null ? clean : next.execute(clean, hint);
        });
        options.setBeforeBreadcrumb((crumb, hint) -> breadcrumb(crumb));
    }
}
