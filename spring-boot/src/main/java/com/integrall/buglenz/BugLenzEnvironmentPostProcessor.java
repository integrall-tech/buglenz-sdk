package com.integrall.buglenz;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

/**
 * Turns {@code buglenz.*} into the {@code sentry.*} properties the official starter reads, with
 * the highest precedence: an app cannot override the release, the environment or the PII switch.
 */
public class BugLenzEnvironmentPostProcessor implements EnvironmentPostProcessor {

    static final String SOURCE = "buglenz";
    private static final Pattern APP_NAME = Pattern.compile("^[a-z0-9][a-z0-9._-]*$");

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        BugLenzProperties p = Binder.get(environment).bind("buglenz", BugLenzProperties.class).orElseGet(BugLenzProperties::new);
        boolean production = "production".equals(p.getEnvironment());

        if (blank(p.getDsn())) {
            if (production) {
                throw new IllegalStateException("buglenz.dsn is required when buglenz.environment is production");
            }
            return; // not configured: the starter stays inactive
        }
        require(p.getApp(), "buglenz.app");
        require(p.getVersion(), "buglenz.version");
        require(p.getEnvironment(), "buglenz.environment");
        if (!APP_NAME.matcher(p.getApp()).matches()) {
            throw new IllegalStateException("buglenz.app must be lowercase letters, digits, '.', '_' or '-' (got '" + p.getApp() + "')");
        }
        if (p.getVersion().matches(".*[@\\s].*")) {
            throw new IllegalStateException("buglenz.version cannot contain '@' or spaces (got '" + p.getVersion() + "')");
        }

        Map<String, Object> sentry = new LinkedHashMap<>();
        sentry.put("sentry.dsn", p.getDsn());
        sentry.put("sentry.release", p.getApp() + "@" + p.getVersion());
        sentry.put("sentry.environment", p.getEnvironment());
        sentry.put("sentry.send-default-pii", false);
        if (!blank(p.getTenant())) sentry.put("sentry.tags.tenant", p.getTenant());
        if (!blank(p.getCliente())) sentry.put("sentry.tags.cliente", p.getCliente());
        environment.getPropertySources().addFirst(new MapPropertySource(SOURCE, sentry));
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    private static void require(String value, String name) {
        if (blank(value)) throw new IllegalStateException(name + " is required when buglenz.dsn is set");
    }
}
