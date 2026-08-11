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

### Rodar

```bash
pnpm dev
```

Isso sobe `apps/api` e `apps/web` simultaneamente via `pnpm -r --parallel dev`.

- Web: http://localhost:5173
- API: http://localhost:3001

A migration da tabela `tickets` é executada automaticamente na inicialização da API.

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
