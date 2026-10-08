package com.integrall.buglenz;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.sentry.Sentry;
import io.sentry.SentryEvent;
import io.sentry.SentryOptions;
import io.sentry.protocol.User;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.env.MapPropertySource;
import org.springframework.mock.env.MockEnvironment;

class ConfigurationTest {

    private final BugLenzEnvironmentPostProcessor post = new BugLenzEnvironmentPostProcessor();

    private MockEnvironment run(Map<String, Object> props) {
        MockEnvironment env = new MockEnvironment();
        env.getPropertySources().addFirst(new MapPropertySource("app", props));
        post.postProcessEnvironment(env, null);
        return env;
    }

    private static final Map<String, Object> FULL = Map.of(
            "buglenz.dsn", "http://key@localhost:1/1",
            "buglenz.app", "vendax-api",
            "buglenz.version", "2.0.1",
            "buglenz.environment", "homolog",
            "buglenz.tenant", "t1",
            "buglenz.cliente", "acme");

    @Test
    void mapsBugLenzPropertiesToTheOfficialStarter() {
        MockEnvironment env = run(FULL);
        assertThat(env.getProperty("sentry.dsn")).isEqualTo("http://key@localhost:1/1");
        assertThat(env.getProperty("sentry.release")).isEqualTo("vendax-api@2.0.1");
        assertThat(env.getProperty("sentry.environment")).isEqualTo("homolog");
        assertThat(env.getProperty("sentry.send-default-pii")).isEqualTo("false");
        assertThat(env.getProperty("sentry.tags.tenant")).isEqualTo("t1");
        assertThat(env.getProperty("sentry.tags.cliente")).isEqualTo("acme");
    }

    @Test
    void appCannotOverrideWhatTheWrapperFixes() {
        MockEnvironment env = new MockEnvironment()
                .withProperty("sentry.send-default-pii", "true")
                .withProperty("sentry.release", "x");
        FULL.forEach((k, v) -> env.setProperty(k, String.valueOf(v)));
        post.postProcessEnvironment(env, null);
        assertThat(env.getProperty("sentry.send-default-pii")).isEqualTo("false");
        assertThat(env.getProperty("sentry.release")).isEqualTo("vendax-api@2.0.1");
    }

    @Test
    void failsToStartWithoutDsnInProduction() {
        assertThatThrownBy(() -> run(Map.of("buglenz.environment", "production")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("buglenz.dsn");
    }

    @Test
    void staysInactiveWithoutDsnOutsideProduction() {
        MockEnvironment env = run(Map.of("buglenz.environment", "homolog"));
        assertThat(env.getProperty("sentry.dsn")).isNull();
    }

    @Test
    void namesTheMissingProperty() {
        assertThatThrownBy(() -> run(Map.of("buglenz.dsn", "http://k@h/1", "buglenz.environment", "homolog", "buglenz.version", "1")))
                .hasMessageContaining("buglenz.app");
        assertThatThrownBy(() -> run(Map.of("buglenz.dsn", "http://k@h/1", "buglenz.environment", "homolog", "buglenz.app", "a")))
                .hasMessageContaining("buglenz.version");
    }

    @Test
    void rejectsBadAppAndVersion() {
        assertThatThrownBy(() -> run(Map.of("buglenz.dsn", "http://k@h/1", "buglenz.environment", "e", "buglenz.app", "Vendax Api", "buglenz.version", "1")))
                .hasMessageContaining("buglenz.app");
        assertThatThrownBy(() -> run(Map.of("buglenz.dsn", "http://k@h/1", "buglenz.environment", "e", "buglenz.app", "a", "buglenz.version", "1@x")))
                .hasMessageContaining("buglenz.version");
    }

    @Test
    void installsTheFilterOnTheStarterOptions() {
        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(BugLenzAutoConfiguration.class))
                .withPropertyValues("buglenz.dsn=http://key@localhost:1/1", "buglenz.extra-denied-keys=matricula")
                .run(ctx -> {
                    @SuppressWarnings("unchecked")
                    Sentry.OptionsConfiguration<SentryOptions> cfg = ctx.getBean(Sentry.OptionsConfiguration.class);
                    SentryOptions options = new SentryOptions();
                    cfg.configure(options);
                    SentryEvent event = new SentryEvent();
                    User user = new User();
                    user.setId("u-1");
                    user.setEmail("ana@example.com");
                    event.setUser(user);
                    event.setExtra("matricula", "123");
                    SentryEvent out = options.getBeforeSend().execute(event, new io.sentry.Hint());
                    assertThat(out.getUser().getEmail()).isNull();
                    assertThat(out.getExtras()).containsEntry("matricula", "[Filtered]");
                    assertThat(options.getBeforeBreadcrumb()).isNotNull();
                });
    }

    @Test
    void isInactiveWithoutDsn() {
        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(BugLenzAutoConfiguration.class))
                .run(ctx -> assertThat(ctx).doesNotHaveBean(Sentry.OptionsConfiguration.class));
    }
}
