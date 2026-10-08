package com.integrall.buglenz;

import io.sentry.Sentry;
import io.sentry.SentryOptions;
import io.sentry.spring.boot.jakarta.SentryAutoConfiguration;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;

/** Installs the layer 1 filters on the official starter's options. */
@AutoConfiguration(before = SentryAutoConfiguration.class)
@ConditionalOnProperty(name = "buglenz.dsn")
@EnableConfigurationProperties(BugLenzProperties.class)
public class BugLenzAutoConfiguration {

    @Bean
    Sentry.OptionsConfiguration<SentryOptions> buglenzOptions(BugLenzProperties properties) {
        Scrubber scrubber = new Scrubber(ScrubRules.shared(), properties.getExtraDeniedKeys());
        return scrubber::install;
    }
}
