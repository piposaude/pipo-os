# pipo-os

Serviço fullstack para gerenciamento de tickets internos.

## Stack

- **Backend** — Node.js + Express + TypeScript (porta 3001)
- **Frontend** — Vite + React + TypeScript (porta 5173)
- **Banco de dados** — PostgreSQL 15

## Desenvolvimento local

### Pré-requisitos

- Node.js 20+
- Docker + Docker Compose

### Subir o banco

```bash
docker compose up -d
```

Isso sobe um Postgres 15 local na porta `5432` com as credenciais:

| Variável | Valor |
|----------|-------|
| `POSTGRES_USER` | `pipo_os` |
| `POSTGRES_PASSWORD` | `pipo_os` |
| `POSTGRES_DB` | `pipo_os` |

### Instalar dependências

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
```

### Rodar

```bash
npm run dev
```

Isso sobe backend e frontend simultaneamente via `concurrently`.

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

A migration da tabela `tickets` é executada automaticamente na inicialização do backend.

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `DATABASE_URL` | `postgresql://pipo_os:pipo_os@localhost:5432/pipo_os` | Connection string do Postgres |

## API

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/tickets` | Lista todos os tickets |
| `POST` | `/api/tickets` | Cria um novo ticket |
| `PUT` | `/api/tickets/:id` | Atualiza título, descrição ou status |
| `DELETE` | `/api/tickets/:id` | Remove um ticket |

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

### Pipeline

O `.gitlab-ci.yml` inclui o template terraform da Pipo, que executa `terraform plan` em MRs e `terraform apply` ao mergear na branch principal.
