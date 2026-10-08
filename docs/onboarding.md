# Onboarding de um app no BugLenz

Do projeto na instância ao primeiro erro visto. Vale para apps web em React e backends Spring Boot 3
(Java 21). As versões homologadas estão em [`matriz.md`](matriz.md).

## Antes de começar

- Uma instância no ar, com `PUBLIC_URL` igual ao endereço que os apps e o CI alcançam. Sem isso o
  envio de source maps falha (a instância anuncia um endereço de upload que ninguém alcança).
- Um usuário com acesso ao painel da instância.
- O host do DSN fica **embutido em cada build**. Trocá-lo depois exige novo build de todos os apps,
  então confirme o endereço definitivo antes do primeiro app.

## 1. Crie o projeto na instância

Um projeto por **aplicação implantável**, não por produto: `vendax-web` e `vendax-api` são dois
projetos. O ambiente (`production`, `homolog`) é separado pelo campo `environment`, não por projeto.

1. No painel, crie o projeto e copie o **DSN**.
2. Anote o **slug** do projeto (a API o devolve na criação, `POST /api/projects`); o upload de source
   maps usa o slug.
3. Crie um **token de API** para o CI do app e guarde-o no cofre do CI. O token fica fora do código e
   fora do bundle.

## 2. App React

```bash
npm install @integrall/buglenz-react @sentry/react@11.5.0
npm install -D @sentry/vite-plugin@5.4.1
```

```tsx
import { initBugLenz, identify, ErrorBoundary } from '@integrall/buglenz-react';

initBugLenz({
  dsn: import.meta.env.VITE_BUGLENZ_DSN,
  app: 'vendax-web',              // o release vira "vendax-web@<version>"
  version: __APP_VERSION__,       // injetada no build
  environment: import.meta.env.MODE === 'production' ? 'production' : 'homolog',
  tenant: 'acme-sp',
  cliente: 'acme',
});

identify({ id: usuario.id });     // só o id interno; e-mail e documentos são recusados

<ErrorBoundary fallback={<MinhaTelaDeErro />}>{children}</ErrorBoundary>
```

Regras que o wrapper impõe, e que o app não consegue desfazer:

- O SDK cru do Sentry 11 **coleta tudo por padrão** (usuário, cookies, cabeçalhos, corpos, query
  strings). O wrapper desliga cada categoria. Não chame `Sentry.init` diretamente.
- O evento sai só com `user.id`; chaves como `password`, `token`, `cpf` e `authorization` viram
  `[Filtered]`; CPF, CNPJ, cartão e e-mail no texto viram `[cpf]`, `[cnpj]`, `[cartao]` e `[email]`.
- Fora de `production`, `identify` lança erro se receber e-mail ou documento; em `production`
  descarta e avisa no console.
- Chaves próprias do seu produto: `extraDeniedKeys: ['matricula']`.

### Source maps (Vite)

```ts
// vite.config.ts
import { brandSourceMaps } from '@integrall/buglenz-react/vite';

export default defineConfig({
  plugins: [
    brandSourceMaps({
      url: process.env.BUGLENZ_URL!,            // PUBLIC_URL da instância
      authToken: process.env.BUGLENZ_TOKEN!,    // token de API, do cofre do CI
      project: process.env.BUGLENZ_PROJECT!,    // slug
      app: 'vendax-web',
      version: process.env.APP_VERSION!,        // a mesma passada ao initBugLenz
    }),
  ],
  build: { sourcemap: true },
});
```

O plugin envia os mapas só para a instância (a telemetria do próprio plugin fica desligada) e apaga
os `.map` do build, então eles não vão para produção. O `app` e a `version` precisam ser idênticos
nos dois lugares, ou o frame não é traduzido.

## 3. Backend Spring Boot

```xml
<dependency>
  <groupId>com.integrall.buglenz</groupId>
  <artifactId>buglenz-spring-boot-starter</artifactId>
  <version>0.1.0</version>
</dependency>
```

```properties
buglenz.dsn=${BUGLENZ_DSN}
buglenz.app=vendax-api
buglenz.version=@project.version@     # filtrado pelo Maven (spring-boot-starter-parent)
buglenz.environment=production
buglenz.tenant=acme-sp
buglenz.cliente=acme
# buglenz.extra-denied-keys=matricula,codigo-interno
```

- Em `production`, a aplicação **não inicia** sem `buglenz.dsn`. Fora de produção, sem DSN o starter
  fica inativo.
- O wrapper não liga sessões: o release health vem do front-end.
- O wrapper escreve `sentry.dsn`, `sentry.release`, `sentry.environment` e
  `sentry.send-default-pii=false` com prioridade máxima; configurá-los à mão não adianta.
- Os `contexts` do evento (sistema, dispositivo) não são inspecionados.

## 4. Valide em homologação, nunca direto em produção

1. Provoque um erro de teste no app em `homolog`.
2. Na instância, a issue precisa mostrar:
   - **frame legível**, com o arquivo e a linha originais (se aparecer código minificado, os source
     maps não chegaram: confira `app`, `version`, o slug e o `PUBLIC_URL`);
   - `release` no formato `app@versão`, `environment` e as tags `tenant` e `cliente`;
   - **nenhum dado pessoal** no título, na mensagem, no usuário e nos extras.
3. Só então publique em produção.

## 5. Alerta

No painel: cadastre um canal em **Integrações** (e-mail, Slack ou webhook), envie o teste do canal e
crie no projeto uma regra `new_issue` apontando para ele. A API correspondente é
`/api/integrations` e `/api/projects/{id}/alert-rules`.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Upload de source maps falha com 401 ou conexão recusada | `PUBLIC_URL` da instância ausente ou errado |
| Frames minificados na issue | `app`/`version` diferentes entre `initBugLenz` e o plugin, ou slug errado |
| App Spring não sobe em produção | falta `buglenz.dsn` |
| `identify` lança erro | foi passado e-mail, documento ou outro campo além de `id` |
| Nenhum evento chega do navegador | bloqueador de anúncios (ainda não há tunnel) ou DSN com host inalcançável |
| Erro tem título mascarado mas o app mostra o texto original | esperado: o wrapper mascara só o que sai do app |

## Limites conhecidos

- Sem tunnel: bloqueadores de anúncio podem impedir o envio direto do navegador.
- Integração com o roteador do React ainda não incluída (use `extra.integrations`).
- Sem Flutter nem mobile nesta versão.
