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
├── global/   — ECR registry
├── stag/     — RDS Postgres (t4g.medium, 20GB) + DNS pipo-os-db.pipo.health
└── prod/     — RDS Postgres (m6g.large, 50GB, backup 7d) + DNS pipo-os-db.piposaude.com.br
```

As credenciais do banco são injetadas como variáveis de ambiente no pipeline (`TF_VAR_stag_db_user`, etc.).

### Deploy

`apps/api` e `apps/web` são publicados como **imagens separadas** (`Dockerfile.api`, `Dockerfile.web`), cada uma com seu próprio repositório ECR, Deployment e Service em `.k8s/raw/{stag,prod}/`. Um único Ingress por ambiente roteia por path no mesmo host: `/api` → serviço da api, `/` → serviço do web (nginx com fallback de SPA).

### Pipeline

O `.gitlab-ci.yml` inclui o template terraform da Pipo, que executa `terraform plan` em MRs e `terraform apply` ao mergear na branch principal.
