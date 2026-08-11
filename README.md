# pipo-os

Serviço fullstack para gerenciamento de tickets internos.

## Stack

- **`apps/api`** — Node.js + Fastify + TypeScript, monólito modular (porta 3001)
- **`apps/web`** — Vite + React + TypeScript (porta 5173)
- **`packages/api-client`** — client TypeScript gerado a partir do contrato OpenAPI, consumido pelo `apps/web`
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

| Variável       | Padrão                                                | Descrição                                 |
| -------------- | ----------------------------------------------------- | ----------------------------------------- |
| `PORT`         | `3001`                                                | Porta HTTP da API                         |
| `DATABASE_URL` | `postgresql://pipo_os:pipo_os@localhost:5432/pipo_os` | Connection string do Postgres             |
| `CORS_ORIGIN`  | `http://localhost:5173`                               | Origens permitidas, separadas por vírgula |

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

O deploy roda via GitHub Actions (`.github/workflows/deploy.yml`): build & push das imagens para o ECR, autenticação no EKS via OIDC (`aws-actions/configure-aws-credentials`) e aplicação dos manifests em `.k8s/raw/{stag,prod}/`. As mudanças em `.tf/` (IAM roles, EKS access entries) são aplicadas manualmente via `terraform apply` — não há pipeline de Terraform neste repositório.
