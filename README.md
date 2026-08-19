# pipo-os

Serviço fullstack para gerenciamento de tickets internos.

## Stack

- **`apps/api`** — Node.js + Fastify + TypeScript, monólito modular (porta 3001)
- **`apps/web`** — Vite + React + TypeScript (porta 5173)
- **`packages/api-client`** — client TypeScript gerado a partir do contrato OpenAPI, consumido pelo `apps/web`
- **Banco de dados** — PostgreSQL 17

Monorepo gerenciado com **pnpm workspaces**.

## Desenvolvimento local

### Pré-requisitos

- Node.js 22+ (ver `.nvmrc`)
- pnpm (ver `packageManager` em `package.json`)
- Docker + Docker Compose

### Subir o banco

```bash
docker compose up -d
```

Isso sobe um Postgres 17 local na porta `5432` com as credenciais:

| Variável            | Valor     |
| ------------------- | --------- |
| `POSTGRES_USER`     | `pipo_os` |
| `POSTGRES_PASSWORD` | `pipo_os` |
| `POSTGRES_DB`       | `pipo_os` |

### Instalar dependências

```bash
pnpm install
```

### Migrations

As migrations versionadas (Kysely `Migrator`, definidas em `apps/api/src/migrations/`) rodam automaticamente sempre que a API sobe — em dev (`pnpm dev`, `pnpm test`) e em produção.
Não é preciso migrar manualmente antes de subir a API; a baseline `0001_tickets` é idempotente e segura para adotar bancos já existentes.

Para operar as migrations manualmente (sem subir a API), use o CLI do `kysely-ctl`:

```bash
pnpm --filter pipo-os-backend db:migrate   # aplica as migrations pendentes
pnpm --filter pipo-os-backend db:rollback  # desfaz a última migration
```

### Gerar os tipos do banco

```bash
pnpm --filter pipo-os-backend db:codegen
```

Introspecciona o Postgres local via `kysely-codegen` e regenera `apps/api/src/infrastructure/db-types.ts`.
Esse arquivo é gerado — não deve ser editado manualmente.
Rode sempre que uma migration mudar o schema.

### Rodar

```bash
pnpm dev
```

Isso sobe `apps/api` e `apps/web` simultaneamente via `pnpm -r --parallel dev`.

- Web: http://localhost:5173
- API: http://localhost:3001

## Variáveis de ambiente

| Variável                 | Padrão                                                | Descrição                                                                                                                   |
| ------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                   | `3001`                                                | Porta HTTP da API                                                                                                           |
| `DATABASE_URL`           | `postgresql://pipo_os:pipo_os@localhost:5432/pipo_os` | Connection string do Postgres                                                                                               |
| `CORS_ORIGIN`            | `http://localhost:5173`                               | Origens permitidas, separadas por vírgula                                                                                   |
| `LOG_LEVEL`              | `info` em produção, `debug` nos demais ambientes      | Nível mínimo de log do pino                                                                                                 |
| `SENTRY_DSN`             | _(vazio, Sentry desabilitado)_                        | DSN do projeto Sentry da api. Sempre desabilitado em dev/test                                                               |
| `WEB_APP_SENTRY_DSN`     | _(vazio, Sentry desabilitado)_                        | DSN do projeto Sentry do web, injetado em build-time pelo Vite                                                              |
| `COOKIE_SECRET`          | valor de dev fixo fora de produção                    | Secret de assinatura HMAC dos cookies de sessão (`@fastify/cookie`). Obrigatório em produção — a API falha ao subir sem ele |
| `AUTH_SERVICE_URL`       | `http://localhost:9090`                               | URL base do auth-service (backend de identidade da Pipo)                                                                    |
| `GOOGLE_OAUTH_CLIENT_ID` | _(vazio)_                                             | Client ID OAuth do Google reaproveitado do client "Backoffice" já registrado no GCP (o mesmo usado pelo `tools`)            |
| `APP_BASE_URL`           | `http://localhost:5173`                               | Origem pública da aplicação, usada para montar o `redirect_uri` do fluxo Google e os redirects de erro                      |
| `ALLOWED_EMAIL_DOMAINS`  | `piposaude.com.br,pipo.ai`                            | Domínios de e-mail aceitos no login Google, separados por vírgula                                                           |
| `DEV_LOGIN_ENABLED`      | _(desligado)_                                         | Habilita `POST /api/auth/dev-login`. Só `true` liga; a API **falha no boot** se chegar em ambiente deployado                |
| `DEV_LOGIN_EMAIL`        | `dev@piposaude.com.br`                                | Identidade usada pelo login local; precisa pertencer a `ALLOWED_EMAIL_DOMAINS`                                              |

## Observabilidade

- **Logs**: pino estruturado (`apps/api`), com redaction de PII centralizada em `@pipo-os/observability`.
  Isso cobre headers de autenticação, senhas, tokens, CPF, tax-id, e-mail e endereço.
  Nunca interpole dados sensíveis na mensagem de log — passe-os como primeiro argumento do logger (`log.info({ ticketId }, 'ticket created')`).
- **Métricas**: a api expõe `GET /metrics` numa porta dedicada (`8080`, separada da porta de negócio) com métricas default do Node.js e histograma/summary de duração por rota, método e status.
  Métricas de negócio devem ser criadas nos módulos via `app.metrics.client`, seguindo a convenção `pipos_<dominio>_<metrica>_<unidade>`.
- **Erros**: erros 5xx não tratados na api e crashes de render no web são reportados ao Sentry quando `SENTRY_DSN`/`WEB_APP_SENTRY_DSN` estão configurados, sem PII no contexto da request.

## API

| Método   | Rota               | Descrição                            |
| -------- | ------------------ | ------------------------------------ |
| `GET`    | `/api/tickets`     | Lista tickets com filtros e paginação        |
| `GET`    | `/api/tickets/:id` | Retorna um ticket pelo ID                    |
| `POST`   | `/api/tickets`     | Cria um novo ticket                          |
| `PATCH`  | `/api/tickets/:id` | Atualiza campos do ticket parcialmente       |

### Autenticação

O login é feito via Google, reaproveitando o auth-service da Pipo (`pipoengineering/platform/auth-service`) como backend de identidade — sem client OAuth próprio no Google Cloud, o PipOS reutiliza o mesmo client "Backoffice" já usado pelo `tools`.

| Método | Rota                        | Descrição                                                                                                                                                     |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/auth/google`          | Inicia o fluxo OAuth2: redireciona (302) para o Google com um cookie de `state` assinado                                                                      |
| `GET`  | `/api/auth/google/callback` | Callback do Google: troca o `code` via `POST {auth-service}/v1/google-tools-login`, valida o domínio do e-mail e grava a sessão em cookie httpOnly + assinado |
| `GET`  | `/api/auth/me`              | Dados da sessão atual (`email`, `policies`) a partir do cookie de sessão                                                                                      |
| `POST` | `/api/auth/logout`          | Limpa o cookie de sessão (o auth-service não expõe revogação — a sessão local é o que existe)                                                                 |

O JWT emitido pelo auth-service (ES256, assinado via AWS KMS) não pode ser validado localmente — não há JWKS público.
A API confia no cookie assinado (HMAC via `COOKIE_SECRET`) para garantir que o token não foi adulterado pelo cliente, e apenas decodifica o payload para ler `email`/`policies`/`exp`.

**Pré-requisito de infraestrutura**: a redirect URI `{APP_BASE_URL}/api/auth/google/callback` de cada ambiente (local, stag, prod) precisa estar registrada no client OAuth "Backoffice" do Google Cloud Console — o mesmo client usado pelo `tools`.

#### Autenticação em desenvolvimento

Copie `apps/api/.env.example` para `apps/api/.env` (git-ignored) e ajuste. O `pnpm dev` carrega esse arquivo automaticamente; variáveis exportadas no shell têm precedência sobre ele.

**Login Google local.** Funciona apontando para o auth-service de stag ou de prod, via `AUTH_SERVICE_URL`:

```bash
AUTH_SERVICE_URL=https://auth-service.pipo.health        # staging
AUTH_SERVICE_URL=https://auth-service.piposaude.com.br   # produção
```

Também exige `GOOGLE_OAUTH_CLIENT_ID` preenchido e a redirect URI `http://localhost:5173/api/auth/google/callback` registrada no client OAuth do GCP.

**Login local (`POST /api/auth/dev-login`).** Atalho de desenvolvimento que emite uma sessão sem passar pelo Google nem pelo auth-service. Como isso é, por construção, um bypass completo de autenticação, ele é protegido em camadas:

- O botão no web fica atrás de `import.meta.env.DEV`, então o Vite o elimina do bundle de produção em build time — junto com o `fetch` e a copy dele. Dá para conferir: `grep -c "dev-login" apps/web/dist/assets/*.js` retorna `0`.
- Na API a rota exige `DEV_LOGIN_ENABLED=true` (opt-in explícito; ausência = desligado). A flag vive no script `dev` do `apps/api/package.json` — a imagem de produção roda `node dist/server.js` e nunca a vê.
- Quando desligada, a rota **não é registrada** — responde 404 como qualquer caminho inexistente, sem revelar que existe.
- Se `DEV_LOGIN_ENABLED=true` chegar a um ambiente com `NODE_ENV=production` ou `APP_ENV=stag|prod`, a API **falha no boot**. Uma configuração errada vira CrashLoop visível em vez de porta aberta silenciosa. O mesmo vale para um `DEV_LOGIN_EMAIL` fora de `ALLOWED_EMAIL_DOMAINS`.
- A rota só aceita requisições de loopback. Como o `trustProxy` do Fastify está desligado, esse IP é o socket real e não é forjável via `X-Forwarded-For`.
- Ela é omitida do `openapi.json` (`hide: true`), então não chega ao `api-client` nem faz o contrato variar conforme o ambiente.

A identidade vem de `DEV_LOGIN_EMAIL` (padrão `dev@piposaude.com.br`); as `policies` podem ser passadas no corpo para testar autorização:

```bash
curl -X POST http://localhost:3001/api/auth/dev-login \
  -H 'Content-Type: application/json' \
  -d '{"policies":["admin/allow/administrate/ticket/*"]}'
```

Essas garantias são cobertas por testes em `apps/api/src/modules/auth/dev-login.test.ts` — inclusive as que verificam a recusa no boot.

### Payload de criação

```json
{
  "title": "Título do ticket",
  "description": "Descrição detalhada",
  "status": "open"
}
```

Status possíveis: `open`, `in_progress`, `closed`.

### Contrato OpenAPI

O contrato REST da API é um artefato versionado: `openapi.json`, na raiz do repo.
Ele é gerado a partir dos schemas Zod da API (via `@fastify/swagger` + `@fastify/type-provider-zod`), então nunca deve ser editado manualmente.

```bash
pnpm --filter pipo-os-backend openapi:export
```

Regenera `openapi.json`.
Rode sempre que uma rota ou schema de `apps/api/src/modules/**` mudar.
O CI falha se o arquivo commitado divergir do gerado (`git diff --exit-code openapi.json`).

Em desenvolvimento, o Swagger UI fica disponível em [http://localhost:3001/docs](http://localhost:3001/docs).

### `packages/api-client`

Client TypeScript tipado derivado do `openapi.json`, usado pelo `apps/web` (e por futuros consumidores TS).
Combina [`openapi-typescript`](https://openapi-ts.dev) (geração de tipos), [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch) (client HTTP sem runtime) e [`openapi-react-query`](https://openapi-ts.dev/openapi-react-query) (hooks para o TanStack Query).

```bash
pnpm --filter @pipo-os/api-client generate
```

Regenera os tipos em `packages/api-client/src/generated/schema.d.ts` a partir do `openapi.json` da raiz.
Rode sempre depois de `openapi:export`, quando o contrato mudar.

## Infraestrutura

A infraestrutura AWS é gerenciada via Terraform em `.tf/`:

```
.tf/
├── global/     — ECR registries + IAM roles OIDC do GitHub Actions (deploy stag/prod)
└── eks-access/ — EKS access entries + binding do ClusterRole crossplane-edit para as roles de deploy
```

O banco de dados **não é uma instância RDS dedicada**: `pipo_os` é um database lógico provisionado via Crossplane (`.k8s/raw/{stag,prod}/postgres-crossplane.yaml`) dentro da instância PostgreSQL compartilhada da Pipo (`psql.pipo.health` em stag, `psql.piposaude.com.br` em prod). O Secret `pipo-os-postgres` (gerado a partir de `postgres-secret.yaml.tmpl` no deploy) expõe `POSTGRES_HOST/PORT/USER/PASSWORD/DB` e `DATABASE_URL` prontos para uso.

### Deploy

`apps/api` e `apps/web` são publicados como **imagens separadas** (`Dockerfile.api`, `Dockerfile.web`), cada uma com seu próprio repositório ECR, Deployment e Service em `.k8s/raw/{stag,prod}/`. Um único Ingress por ambiente roteia por path no mesmo host: `/api` → serviço da api, `/` → serviço do web (nginx com fallback de SPA).

### Pipeline

`.github/workflows/ci-checks.yml` é um workflow reutilizável (`workflow_call`) com o job de lint/typecheck/test/build via pnpm; tanto `test.yml` (PRs) quanto `deploy.yml` (push em `main`/tag) o chamam, evitando duplicar os steps.

O deploy (`.github/workflows/deploy.yml`) builda e publica as imagens de `apps/api` e `apps/web` de forma independente: um job `changes` (via `dorny/paths-filter`) detecta se a mudança tocou `apps/api/**`, `apps/web/**` ou `packages/**` (que afeta as duas) e só builda/publica/faz rollout da(s) app(s) correspondente(s) — em pushes para `main`. Em tags de versão (`v1`, `v2`, ... — release para produção), as duas imagens são sempre publicadas e deployadas, para garantir consistência da versão promovida. Recursos de cluster compartilhados (Ingress, secrets, ServiceAccount, database Crossplane) são aplicados uma única vez por deploy, independente de qual app mudou.

Autenticação no EKS via OIDC (`aws-actions/configure-aws-credentials`). As mudanças em `.tf/` (IAM roles, EKS access entries) são aplicadas manualmente via `terraform apply` — não há pipeline de Terraform neste repositório.

O registry `@piposaude` (GitHub Packages) exige autenticação mesmo para leitura; `pnpm install` no CI usa o secret `NODE_AUTH_TOKEN` (PAT com escopo `read:packages`) para isso. Localmente, configure o mesmo token em `~/.npmrc`. Hoje nenhuma dependência do escopo `@piposaude` é instalada (isso chega com o design system em `apps/web`), mas o plumbing já está em vigor.
