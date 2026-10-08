package com.integrall.buglenz;

import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** {@code buglenz.*} properties: the only configuration an app writes. */
@ConfigurationProperties(prefix = "buglenz")
public class BugLenzProperties {

    /** DSN of the project in the instance. */
    private String dsn;
    /** Deployable app name; the release becomes {@code <app>@<version>}. */
    private String app;
    /** Version of the artefact, for example {@code @project.version@} filtered by Maven. */
    private String version;
    private String environment;
    private String tenant;
    private String cliente;
    /** Extra keys (besides the shared list) whose values are removed. */
    private List<String> extraDeniedKeys = new ArrayList<>();

    public String getDsn() { return dsn; }
    public void setDsn(String dsn) { this.dsn = dsn; }
    public String getApp() { return app; }
    public void setApp(String app) { this.app = app; }
    public String getVersion() { return version; }
    public void setVersion(String version) { this.version = version; }
    public String getEnvironment() { return environment; }
    public void setEnvironment(String environment) { this.environment = environment; }
    public String getTenant() { return tenant; }
    public void setTenant(String tenant) { this.tenant = tenant; }
    public String getCliente() { return cliente; }
    public void setCliente(String cliente) { this.cliente = cliente; }
    public List<String> getExtraDeniedKeys() { return extraDeniedKeys; }
    public void setExtraDeniedKeys(List<String> extraDeniedKeys) { this.extraDeniedKeys = extraDeniedKeys; }
}
