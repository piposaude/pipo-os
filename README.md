# pipo-os

Serviço fullstack para gerenciamento de tickets internos.

## Stack

- **`apps/api`** — Node.js + Fastify + TypeScript, monólito modular (porta 3001)
- **`apps/web`** — Vite + React + TypeScript (porta 5173)
- **Banco de dados** — PostgreSQL 15

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

Isso sobe um Postgres 15 local na porta `5432` com as credenciais:

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

| Variável             | Padrão                                                | Descrição                                                      |
| -------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| `PORT`               | `3001`                                                | Porta HTTP da API                                              |
| `DATABASE_URL`       | `postgresql://pipo_os:pipo_os@localhost:5432/pipo_os` | Connection string do Postgres                                  |
| `CORS_ORIGIN`        | `http://localhost:5173`                               | Origens permitidas, separadas por vírgula                      |
| `LOG_LEVEL`          | `info` em produção, `debug` nos demais ambientes      | Nível mínimo de log do pino                                    |
| `SENTRY_DSN`         | _(vazio, Sentry desabilitado)_                        | DSN do projeto Sentry da api. Sempre desabilitado em dev/test  |
| `WEB_APP_SENTRY_DSN` | _(vazio, Sentry desabilitado)_                        | DSN do projeto Sentry do web, injetado em build-time pelo Vite |

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
| `GET`    | `/api/tickets`     | Lista todos os tickets               |
| `POST`   | `/api/tickets`     | Cria um novo ticket                  |
| `PUT`    | `/api/tickets/:id` | Atualiza título, descrição ou status |
| `DELETE` | `/api/tickets/:id` | Remove um ticket                     |

### Payload de criação

```json
{
  "title": "Título do ticket",
  "description": "Descrição detalhada",
  "status": "open"
}
```

Status possíveis: `open`, `in_progress`, `closed`.

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

O deploy (`.github/workflows/deploy.yml`) builda e publica as imagens de `apps/api` e `apps/web` de forma independente: um job `changes` (via `dorny/paths-filter`) detecta se a mudança tocou `apps/api/**`, `apps/web/**` ou `packages/**` (que afeta as duas) e só builda/publica/faz rollout da(s) app(s) correspondente(s) — em pushes para `main`. Em tags semver (release para produção), as duas imagens são sempre publicadas e deployadas, para garantir consistência da versão promovida. Recursos de cluster compartilhados (Ingress, secrets, ServiceAccount, database Crossplane) são aplicados uma única vez por deploy, independente de qual app mudou.

Autenticação no EKS via OIDC (`aws-actions/configure-aws-credentials`). As mudanças em `.tf/` (IAM roles, EKS access entries) são aplicadas manualmente via `terraform apply` — não há pipeline de Terraform neste repositório.

O registry `@piposaude` (GitHub Packages) exige autenticação mesmo para leitura; `pnpm install` no CI usa o secret `NODE_AUTH_TOKEN` (PAT com escopo `read:packages`) para isso. Localmente, configure o mesmo token em `~/.npmrc`. Hoje nenhuma dependência do escopo `@piposaude` é instalada (isso chega com o design system em `apps/web`), mas o plumbing já está em vigor.
