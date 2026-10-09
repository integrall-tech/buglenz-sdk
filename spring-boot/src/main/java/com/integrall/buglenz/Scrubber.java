package com.integrall.buglenz;

import io.sentry.Breadcrumb;
import io.sentry.Hint;
import io.sentry.Sentry;
import io.sentry.SentryBaseEvent;
import io.sentry.SentryEvent;
import io.sentry.protocol.Contexts;
import io.sentry.protocol.Message;
import io.sentry.protocol.Request;
import io.sentry.protocol.SentryException;
import io.sentry.protocol.SentrySpan;
import io.sentry.protocol.SentryTransaction;
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
            // An identifier is not free text (a digit-only span id would pass for a card), but an SDK
            // may build the user id from the e-mail, so an `*id` value still loses an address.
            if (rules.isIdKey(key)) return TextMasker.maskEmails(text.toString());
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
        base(event);

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
        return event;
    }

    /**
     * A transaction carries the same personal data as an error and more (URLs and SQL in span
     * descriptions), and an app can switch tracing on with {@code sentry.traces-sample-rate}. The
     * transaction's own name is a route template and is left as it is: the SDK offers no setter.
     */
    public SentryTransaction transaction(SentryTransaction tx) {
        base(tx);
        List<SentrySpan> spans = tx.getSpans();
        if (spans != null) {
            List<SentrySpan> clean = new ArrayList<>();
            for (SentrySpan s : spans) {
                clean.add(new SentrySpan(
                        s.getStartTimestamp(), s.getTimestamp(), s.getTraceId(), s.getSpanId(), s.getParentSpanId(),
                        s.getOp(), TextMasker.mask(s.getDescription()), s.getStatus(), s.getOrigin(),
                        s.getTags() == null ? null : tagMap(s.getTags()), s.getMeasurements(),
                        s.getData() == null ? null : map(s.getData())));
            }
            spans.clear();
            spans.addAll(clean);
        }
        return tx;
    }

    private Map<String, String> tagMap(Map<String, String> tags) {
        Map<String, String> clean = new HashMap<>();
        tags.forEach((k, v) -> clean.put(k, rules.isDenied(k, extraKeys) ? FILTERED : TextMasker.mask(v)));
        return clean;
    }

    /** What an error and a transaction share: user, request, extras, contexts, tags and breadcrumbs. */
    private void base(SentryBaseEvent event) {
        User user = event.getUser();
        event.setUser(null);
        if (user != null && user.getId() != null) {
            User only = new User();
            only.setId(TextMasker.maskEmails(user.getId()));
            event.setUser(only);
        }

        Request request = event.getRequest();
        event.setRequest(null);
        if (request != null && request.getUrl() != null) {
            Request clean = new Request();
            clean.setUrl(TextMasker.stripUrl(request.getUrl()));
            clean.setMethod(request.getMethod());
            event.setRequest(clean);
        }

        Map<String, Object> extras = event.getExtras();
        if (extras != null) event.setExtras(map(extras));

        // What an app puts in a custom context is a plain map or text, as free as `extra`. The SDK's
        // own contexts (app, device, os, trace...) are typed objects and are left alone.
        Contexts contexts = event.getContexts();
        for (Map.Entry<String, Object> entry : new ArrayList<>(contexts.entrySet())) {
            Object value = entry.getValue();
            if (value instanceof Map<?, ?> || value instanceof CharSequence) {
                contexts.put(entry.getKey(), value(value, entry.getKey(), 0));
            }
        }

        Map<String, String> tags = event.getTags();
        if (tags != null) event.setTags(tagMap(tags));

        List<Breadcrumb> crumbs = event.getBreadcrumbs();
        if (crumbs != null) {
            List<Breadcrumb> clean = new ArrayList<>();
            crumbs.forEach(c -> {
                Breadcrumb b = breadcrumb(c);
                if (b != null) clean.add(b);
            });
            event.setBreadcrumbs(clean);
        }
    }

    public Breadcrumb breadcrumb(Breadcrumb crumb) {
        if ("ui.input".equals(crumb.getCategory())) return null;
        crumb.setMessage(TextMasker.mask(crumb.getMessage()));
        Map<String, Object> data = new HashMap<>(crumb.getData());
        Map<String, Object> clean = map(data);
        // A navigation or request crumb carries URLs, whose query and fragment hold tokens.
        for (String k : new String[] {"url", "from", "to"}) {
            if (clean.get(k) instanceof String u) clean.put(k, TextMasker.stripUrl(u));
        }
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
        io.sentry.SentryOptions.BeforeSendTransactionCallback nextTx = options.getBeforeSendTransaction();
        options.setBeforeSendTransaction((SentryTransaction tx, Hint hint) -> {
            SentryTransaction clean = transaction(tx);
            return nextTx == null ? clean : nextTx.execute(clean, hint);
        });
        options.setBeforeBreadcrumb((crumb, hint) -> breadcrumb(crumb));
    }
}
