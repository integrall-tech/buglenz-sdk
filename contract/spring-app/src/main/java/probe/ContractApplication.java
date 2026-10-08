package probe;

import io.sentry.Breadcrumb;
import io.sentry.Sentry;
import io.sentry.protocol.User;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class ContractApplication {
    public static void main(String[] args) {
        SpringApplication.run(ContractApplication.class, args).close();
    }

    @Bean
    CommandLineRunner run() {
        return args -> {
            // What a careless app does anyway: the wrapper must still keep it from leaving the JVM.
            Sentry.addBreadcrumb(Breadcrumb.info("checkout started for ana@example.com"));
            User user = new User();
            user.setId("u-42");
            user.setEmail("ana@example.com");
            user.setIpAddress("1.2.3.4");
            Sentry.setUser(user);
            Sentry.setTag("nota", "contato ana@example.com");
            Sentry.setExtra("password", "hunter2");

            try {
                throw new IllegalStateException("pedido recusado para cpf 529.982.247-25 (ana@example.com)");
            } catch (Exception e) {
                Sentry.captureException(e);
            }
            Thread t = new Thread(() -> { throw new RuntimeException("uncaught in worker"); }, "worker-1");
            t.start();
            t.join();
            Sentry.flush(5000);
        };
    }
}
