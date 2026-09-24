# pipo-os

Serviço fullstack para gerenciamento de tickets internos.

## Stack

- **`apps/api`** — Node.js + Fastify + TypeScript, monólito modular (porta 3001)
- **`apps/web`** — Vite + React + TypeScript (porta 5173); detalhes em [`apps/web/README.md`](apps/web/README.md)
- **`packages/api-client`** — client TypeScript gerado a partir do contrato OpenAPI, consumido pelo `apps/web`
- **`packages/observability`** — logger, métricas e Sentry compartilhados por api e web; os dois importam o `dist/`, então o pacote precisa de `build` antes do primeiro `pnpm dev` (ver [Rodar](#rodar))
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
pnpm --filter @pipo-os/observability build   # api e web importam o dist/; refaça quando o pacote mudar
pnpm dev
```

Isso sobe `apps/api` e `apps/web` simultaneamente via `pnpm -r --parallel dev`.

- Web: http://localhost:5173
- API: http://localhost:3001

## Variáveis de ambiente

| Variável                       | Padrão                                                              | Descrição                                                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PORT`                         | `3001`                                                              | Porta HTTP da API                                                                                                                                                                          |
| `DATABASE_URL`                 | `postgresql://pipo_os:pipo_os@localhost:5432/pipo_os`               | Connection string do Postgres                                                                                                                                                              |
| `CORS_ORIGIN`                  | `http://localhost:5173`                                             | Origens permitidas, separadas por vírgula                                                                                                                                                  |
| `LOG_LEVEL`                    | `info` em produção, `debug` nos demais ambientes                    | Nível mínimo de log do pino                                                                                                                                                                |
| `SENTRY_DSN`                   | _(vazio, Sentry desabilitado)_                                      | DSN do projeto Sentry da api. Sempre desabilitado em dev/test                                                                                                                              |
| `WEB_APP_SENTRY_DSN`           | _(vazio, Sentry desabilitado)_                                      | DSN do projeto Sentry do web, injetado em build-time pelo Vite                                                                                                                             |
| `COOKIE_SECRET`                | valor de dev fixo fora de produção                                  | Secret de assinatura HMAC dos cookies de sessão (`@fastify/cookie`). Obrigatório em produção — a API falha ao subir sem ele                                                                |
| `AUTH_SERVICE_URL`             | `http://localhost:9090`                                             | URL base do auth-service (backend de identidade da Pipo)                                                                                                                                   |
| `AUTH_SERVICE_INTERNAL_URL`    | `http://auth-service.platform:4000`                                 | URL do listener **interno** do auth-service, o único que responde `/api/verify-token`. Usado só na autenticação de serviço                                                                 |
| `COMPANY_SERVICE_INTERNAL_URL` | _(vazio: `GET /api/companies` responde 503)_                        | URL do listener **interno** do company-service, de onde `GET /api/companies` lê nome e CNPJ das empresas. O valor de cada ambiente está no `deployment-api.yaml` dele                      |
| `SERVICE_ACCOUNT_TOKEN`        | _(vazio; lê `/var/run/secrets/kubernetes.io/serviceaccount/token`)_ | Token com que a API se identifica **ao chamar** o auth-service. No cluster vem do arquivo montado pelo kubelet; a variável existe para desenvolvimento local, onde esse arquivo não existe |
| `SERVICE_ALLOWED_ACCOUNTS`     | _(vazio, nenhum serviço entra)_                                     | Service accounts que podem chamar a API como serviço, no formato `<namespace>/<nome>` e separadas por vírgula                                                                              |
| `GOOGLE_OAUTH_CLIENT_ID`       | _(vazio)_                                                           | Client ID OAuth do Google reaproveitado do client "Backoffice" já registrado no GCP (o mesmo usado pelo `tools`)                                                                           |
| `APP_BASE_URL`                 | `http://localhost:5173`                                             | Origem pública da aplicação, usada para montar o `redirect_uri` do fluxo Google e os redirects de erro                                                                                     |
| `ALLOWED_EMAIL_DOMAINS`        | `piposaude.com.br,pipo.ai`                                          | Domínios de e-mail aceitos no login Google, separados por vírgula                                                                                                                          |
| `DEV_LOGIN_ENABLED`            | _(desligado)_                                                       | Habilita `POST /api/auth/dev-login`. Só `true` liga; a API **falha no boot** se chegar em ambiente deployado                                                                               |
| `DEV_LOGIN_EMAIL`              | `dev@piposaude.com.br`                                              | Identidade usada pelo login local; precisa pertencer a `ALLOWED_EMAIL_DOMAINS`                                                                                                             |

## Observabilidade

- **Logs**: pino estruturado (`apps/api`), com redaction de PII centralizada em `@pipo-os/observability`.
  Isso cobre headers de autenticação, senhas, tokens, CPF, tax-id, e-mail e endereço.
  Nunca interpole dados sensíveis na mensagem de log — passe-os como primeiro argumento do logger (`log.info({ ticketId }, 'ticket created')`).
- **Métricas**: a api expõe `GET /metrics` numa porta dedicada (`8080`, separada da porta de negócio) com métricas default do Node.js e histograma/summary de duração por rota, método e status.
  Métricas de negócio devem ser criadas nos módulos via `app.metrics.client`, seguindo a convenção `pipos_<dominio>_<metrica>_<unidade>`.
- **Erros**: erros 5xx não tratados na api e crashes de render no web são reportados ao Sentry quando `SENTRY_DSN`/`WEB_APP_SENTRY_DSN` estão configurados, sem PII no contexto da request.

## API

As rotas de `/api/auth/*` estão em [Autenticação](#autenticação). Contrato completo em `openapi.json` (26 rotas, 37 operações).

**Chamados**

| Método       | Rota                           | O que faz                                                                                                                                                                                  |
| ------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`        | `/api/tickets/rows`            | **A projeção que a fila consome**: uma linha por chamado, sem o `enrollmentSnapshot`, com o `TicketFilter` inteiro na query, janela `awake`/`sleeping`/`all` e `total` por window function |
| `GET`        | `/api/tickets/:id/timeline`    | **A cronologia do chamado**: comentários e mudanças de status numa lista só, paginada por cursor, com corte por `visibility`; cada item diz o `submissionId` do envio de que veio          |
| `GET`        | `/api/tickets`                 | Listagem antiga, com `status` singular, `search` e `page`/`pageSize`. Duas linguagens de filtro para o mesmo recurso, e `tags` tem operador oposto ao do `/rows` — PD-045                  |
| `GET`        | `/api/tickets/:id`             | Um chamado pelo id, com o `enrollmentSnapshot` completo                                                                                                                                    |
| `POST`       | `/api/tickets`                 | Cria a partir de uma movimentação. Índice parcial impede dois chamados abertos para a mesma matrícula; a duplicata responde `409` com o `ticketId` do que já está aberto                   |
| `PATCH`      | `/api/tickets/:id`             | Muda `assigneeId`, `queueId`, `tags`, `forceCompletion` ou `parentTicketId`. Não aceita `status`: era uma segunda porta de reabertura, sem auditoria                                       |
| `PATCH`      | `/api/tickets/:id/status`      | Muda o status sem texto (a fila, em lote). Grava a mudança em `ticket_status_history` e preenche `closedAt` num status de fechamento                                                       |
| `POST`       | `/api/tickets/:id/claim`       | Atribui a quem está chamando, lendo o `sub` do cookie. `422` se o chamado já estiver fechado — a condição está no `WHERE` do `UPDATE`, então dois cliques simultâneos não furam            |
| `POST`       | `/api/tickets/:id/submissions` | **O envio do composer**: uma parte de texto por canal, o status e a conclusão numa transação só, com um `submissionId`. Qualquer recusa não grava nada, nem o texto                        |
| `GET` `POST` | `/api/tickets/:id/comments`    | Lê e cria comentário. O `POST` aceita só comentário manual (`visibility` + `body`); evento automático ninguém escreve ainda — ACE-247                                                      |

**Pessoas**

| Método | Rota         | O que faz                                                                                                                                                                                                                                                    |
| ------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`  | `/api/users` | Todas as pessoas da Pipo como `{email, name}`, **sem paginação** — a fila precisa do mapa inteiro para nomear as linhas. `?search=` filtra nome e e-mail sem acento e sem caixa, no snapshot em memória. Abre com qualquer uma das duas policies do Pipodesk |

**Empresas**

| Método | Rota             | O que faz                                                                                                                                                                                                                           |
| ------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/companies` | Nome e CNPJ das empresas pedidas em `?ids=a&ids=b` (até 100), lidos na hora do `company-service`, sem cache. Id desconhecido fica de fora; `503` se o `company-service` falhar. Abre com qualquer uma das duas policies do Pipodesk |

**Pods (grupos)**

| Método                 | Rota                                   | O que faz                                                                                                          |
| ---------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `GET` `POST`           | `/api/groups`                          | Lista e cria. A leitura traz `parentId`, a carteira de empresas e `members[]` com papel e ativo                    |
| `GET` `PATCH` `DELETE` | `/api/groups/:id`                      | Lê, renomeia e remove. O `DELETE` responde `409` dizendo qual dos cinco vínculos barrou                            |
| `PUT`                  | `/api/groups/:id/companies`            | Troca a carteira do pod pelo conjunto enviado. Empresa que já é de outro pod dá `409` com o dono                   |
| `POST`                 | `/api/groups/:id/companies/:companyId` | Aloca uma empresa ao pod sem reenviar a carteira. Mesmo `409` do `PUT`                                             |
| `POST`                 | `/api/groups/:id/members`              | Adiciona pessoa ao pod, com papel `admin` (coordenação) ou `member` (analista) e a fatia da carteira que ela segue |
| `PATCH` `DELETE`       | `/api/groups/:id/members/:memberId`    | Muda o papel, a fatia da carteira e desativa a filiação (soft delete por `active`)                                 |

**Filas**

| Método                 | Rota                       | O que faz                                                                         |
| ---------------------- | -------------------------- | --------------------------------------------------------------------------------- |
| `GET` `POST`           | `/api/queues`              | Lista e cria visões salvas. `?favorite=true` devolve só as que o viewer favoritou |
| `GET` `PATCH` `DELETE` | `/api/queues/:id`          | Lê, atualiza e remove uma visão                                                   |
| `POST` `DELETE`        | `/api/queues/:id/favorite` | Favorita e desfavorita, idempotentes, para quem chamou                            |
| `GET`                  | `/api/queues/counts`       | `?ids=` repetido, até 50: quantos chamados cada visão seleciona                   |
| `GET`                  | `/api/queues/:id/tickets`  | Os chamados que o filtro da visão seleciona                                       |

As duas últimas leem a mesma janela do `/api/tickets/rows` — `?window=` com `awake` por padrão —, senão o badge da sidebar somaria chamado fechado e adormecido que a lista embaixo dele não mostra.

#### O que é auditado, e o que não é

Só a mudança de **status** deixa rastro: `PATCH /api/tickets/:id/status` grava uma linha em `ticket_status_history` com autor, estados de origem e destino, motivo e instante. Comentário é o próprio registro.

Os cinco campos do `PATCH /api/tickets/:id` — `assigneeId`, `queueId`, `tags`, `forceCompletion` e `parentTicketId` — e o `POST /api/tickets/:id/claim` fazem `UPDATE` e nada mais. Depois de reatribuir um chamado, o banco não sabe quem atribuiu, quando, nem para quem estava antes; e `forceCompletion`, que é o que permite fechar chamado furando validação, também não tem autor. `ticket_group_members` guarda só o `active` de quem saiu de um pod, sem quem nem quando.

O mecanismo para consertar isso já existe — `ticket_comments` tem `kind`, `event_type` e `metadata`, e o `GET /api/tickets/:id/timeline` já lê evento automático —, mas nada escreve nele. Está em [ACE-247](https://linear.app/piposaudecom/issue/ACE-247) (PD-047).

#### Filas: a visão salva, não a caixa

Fila no Pipodesk é um **filtro salvo**, não um lugar onde o chamado entra. A linha em `ticket_queues` guarda o `TicketFilter` inteiro, o grupo onde a visão mora (`groupId`), quem é o dono (`ownerId`), a ordenação (`sort`) e o agrupamento (`groupBy`). `ownerId` vazio é a visão do time; preenchido, é pessoal — e é o único jeito de dizer isso, porque uma coluna `visibility` ao lado permitiria as duas se contradizerem. `groupBy` nulo é "a visão não impõe agrupamento", que não é `'none'`, "a visão impõe lista plana".

`GET /api/queues/:id/tickets` resolve esse filtro em SQL com o `@me` apontando para quem chamou, então uma visão compartilhada mostra a cada pessoa os chamados dela. A coluna `tickets.queue_id` continua existindo, com FK `ON DELETE SET NULL`, mas **não** é mais o que a rota lê: era o modelo antigo, fila como caixa, em que um chamado fora do filtro aparecia só por ter a coluna preenchida.

O vocabulário de `sort` e `groupBy` vive em `contract/ticket-queue-view.json` e prende os dois lados — `view-vocabulary.ts` na API e o `queue-view-contract.test.ts` no web —, além dos `CHECK`s da migration `0027`. A ordenação por `status` usa a ordem de triagem que a tela mostra (de quem é a bola), não a alfabética da coluna; nulos afundam em qualquer direção, como no web.

**Quem edita o quê.** Visão pessoal, só o dono. Visão do time, quem é `admin` do grupo dela ou de um ancestral — a mesma regra do `canEditQueue` do frontend, agora também no servidor. Criar visão com `ownerId` de outra pessoa responde `403`, e passar a própria visão pessoal para o time exige poder editar a visão do time resultante. Uma visão do time **sem grupo** responde à policy de estrutura sozinha: não há árvore em que procurar coordenação.

**Apagar não é editar.** A policy de estrutura remove qualquer visão, inclusive a pessoal de outra pessoa — ler e editar essa continuam fechados, porque o filtro salvo é dela. O motivo é o `group_id` com FK `ON DELETE RESTRICT`: sem essa saída, a visão pessoal de quem saiu da empresa travaria o `DELETE` do pod para sempre (`409`, `still owns saved views`) e só o dono poderia desbloquear.

**Um filtro que a versão não lê é recusado, não tratado como vazio.** A coluna `filters` é `NOT NULL DEFAULT '{}'`, então o `filters: null` que o `Queue` devolve significa uma coisa só: o jsonb gravado não casa com o `TicketFilter` de hoje. Como `{}` é justamente o filtro que seleciona tudo dentro da janela, `GET /api/queues/:id/tickets` responde `409` nesse caso, e `/api/queues/counts` deixa a visão de fora — do mesmo jeito que deixa a que não existe.

#### Grupos: a hierarquia e quem está nela

O grupo é o pod, e os pods formam uma árvore de no máximo **três níveis** — GEBEN → pod → subtime. `parentId` diz onde cada um está; a raiz é o único grupo sem pai. A API recusa com `422`, e `details` apontando `parentId`, quatro coisas que o banco não consegue barrar sozinho: uma segunda raiz, um pai que não existe, um pai que é o próprio grupo ou um descendente dele (o ciclo), e um quarto nível — inclusive quando ele apareceria por mover um grupo que já tem filhos.

Um índice único parcial sobre `parent_id IS NULL` não coexiste com uma tabela que começa vazia, e o `CHECK` da migration `0024` só alcança `parent_id <> id`, não o ciclo `A→B→A`. Por isso a regra vive no service (`modules/groups/hierarchy.ts`), que resolve pai e filho em memória sobre a lista plana: com três níveis e dezenas de linhas, uma consulta recursiva seria a primeira do repositório sem nada que a pague.

O membro tem papel: `admin` é a coordenação do pod, `member` é a analista. `GET /api/groups` e `GET /api/groups/:id` devolvem, por grupo, `parentId`, a carteira de empresas (`companyIds`) e `members[]` com papel, ativo e a fatia da carteira que segue cada pessoa. Membro inativo continua na lista, sinalizado.

Uma empresa pertence a um pod só — a PK de `ticket_group_companies` é `company_id`. `PUT /api/groups/:id/companies` recebe a carteira inteira e calcula, numa transação, o que entra e o que sai; o que sai leva junto a fatia de quem seguia aquela empresa. Se alguma empresa já é de outro pod, nada muda e o `409` traz `owners[]` com `companyId`, `groupId` e `groupName` do dono de cada uma, para a tela oferecer a troca. `POST /api/groups/:id/companies/:companyId` aloca uma empresa só, para o gesto de carteirar não reenviar a carteira inteira; alocar a mesma empresa de novo ao mesmo pod não é erro. As duas respondem o `GroupDetail`, como na leitura.

A fatia de cada pessoa vai em `companyIds` no `POST` e no `PATCH` de membro: o `PATCH` troca a fatia pelo conjunto enviado e, sem o campo, a mantém. Empresa fora da carteira do pod dá `422` com `details` em `companyIds`, código `not_in_portfolio`, nomeando só as que estão fora — e nada da escrita fica. As duas rotas devolvem o membro com a fatia.

A listagem continua paginada (`pageSize` padrão 20, máximo 100) e ordenada da mais nova para a mais antiga — que é a ordem em que a raiz sai por último. Quem monta a árvore precisa do conjunto inteiro: um `pageSize` que cubra `total`, ou paginar até fechá-lo. Uma página sozinha traz filhos cujo `parentId` ficou de fora, e uma montagem que confia numa página só os descarta calada. `POST` e `PATCH` devolvem o grupo sem `companyIds` e sem `members`, porque nenhum dos dois mexe nessas relações — o cliente atualiza o nó que já tem em mãos, sem refazer o `GET`.

O `DELETE` devolve `409` e diz **qual** vínculo barrou: membro, grupo filho, empresa na carteira, visão salva ou chamado. As cinco chaves estrangeiras devolvem o mesmo código do Postgres, então o que as distingue é o nome da constraint.

### Autenticação

O login é feito via Google, reaproveitando o auth-service da Pipo (`pipoengineering/platform/auth-service`) como backend de identidade — sem client OAuth próprio no Google Cloud, o PipOS reutiliza o mesmo client "Backoffice" já usado pelo `tools`.

| Método | Rota                        | Descrição                                                                                                                                                     |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/auth/google`          | Inicia o fluxo OAuth2: redireciona (302) para o Google com um cookie de `state` assinado                                                                      |
| `GET`  | `/api/auth/google/callback` | Callback do Google: troca o `code` via `POST {auth-service}/v1/google-tools-login`, valida o domínio do e-mail e grava a sessão em cookie httpOnly + assinado |
| `GET`  | `/api/auth/me`              | Sessão atual: `sub`, `email` e `policies` do cookie, mais o `name` da lista de pessoas do auth-service e os `groups` (pod e papel) deste banco                |
| `POST` | `/api/auth/logout`          | Limpa o cookie de sessão (o auth-service não expõe revogação — a sessão local é o que existe)                                                                 |

#### O que cada rota faz

**`GET /api/auth/google`** sorteia um `state` (UUID), guarda num cookie assinado de 5 minutos junto do caminho para onde a pessoa queria ir, e responde `302` para o Google. O `state` é contra CSRF: sem ele, alguém induziria o navegador a completar um login que a pessoa não começou. O `redirect` passa por `safeRedirectPath()` — só caminho relativo, senão um link levaria para fora do domínio depois de autenticar.

**`GET /api/auth/google/callback`** recebe o `code` do Google e, em ordem: apaga o cookie de `state` (uso único) e confere que o valor da URL bate com o dele; troca o `code` pelo access-token no auth-service; decodifica `sub`, `email`, `policies` e `exp`; confere o domínio do e-mail contra `ALLOWED_EMAIL_DOMAINS`; grava o token no cookie de sessão com validade igual ao `exp`; e redireciona. **Nenhum erro vira 500 na tela** — cada falha redireciona com o motivo na URL: `access_denied`, `invalid_state`, `invalid_token`, `domain_not_allowed`, `identity_not_found`, `auth_service_unavailable`.

**`GET /api/auth/me`** responde `sub`, `email` e `policies` direto do cookie, sem rede. O `name` e os `groups` saem de fontes diferentes e são buscados em **paralelo** (`Promise.all`), porque não há dado de um para o outro: em série, uma lista de pessoas fria seguraria a query do banco pelo timeout inteiro da listagem. As duas degradam de propósito de formas diferentes — o nome vira `null` se o auth-service falhar; o banco fora derruba a sessão, porque afirmar "esta pessoa não está em pod nenhum" esconderia ações de coordenação sem dizer por quê.

**`POST /api/auth/logout`** apaga o cookie e responde `204`. É tudo o que existe: o auth-service não expõe revogação, então o token segue tecnicamente válido até o `exp`. Sair é local.

**`POST /api/auth/dev-login`** (só fora do cluster) mina uma sessão sem Google e sem auth-service, com as policies que o corpo pedir. Só é registrada com `DEV_LOGIN_ENABLED=true`, loga um `warn` no boot quando é, e a API **se recusa a subir** se a variável aparecer em ambiente deployado — seria bypass completo de autenticação.

#### O fluxo, do login ao claim

```mermaid
sequenceDiagram
    actor P as Analista
    participant W as Navegador
    participant API as pipo-os/api
    participant G as Google
    participant AS as auth-service
    participant DB as Postgres

    Note over P,DB: 1 · Login — uma vez por sessão (8 h)
    P->>API: GET /api/auth/google
    API-->>W: 302 + cookie oauth_state (5 min)
    W->>G: consentimento
    G-->>API: GET /api/auth/google/callback?code&state
    API->>API: state da URL == state do cookie?
    API->>AS: POST /v1/google-tools-login (code)
    AS-->>API: access-token (JWT ES256)
    API->>API: lê sub/email/policies/exp e confere o domínio
    API-->>W: 302 + cookie de sessão (httpOnly, HMAC)

    Note over P,DB: 2 · Tela inicial — nenhuma chamada ao auth-service pelo navegador
    W->>API: GET /api/auth/me
    API->>AS: lista de pessoas (só se o snapshot venceu — TTL 5 min)
    API->>DB: SELECT ticket_group_members
    API-->>W: sub, email, name, policies, groups
    W->>API: GET /api/users
    API-->>W: data[] do snapshot em memória
    W->>API: GET /api/tickets/rows?filter=...
    API->>DB: SELECT com o TicketFilter
    API-->>W: linhas + total

    Note over P,DB: 3 · Pegar o chamado para si — nenhuma ida à rede externa
    P->>W: clica em "Pegar para mim"
    W->>API: POST /api/tickets/{id}/claim
    API->>API: requireUserId — lê o sub do cookie
    API->>DB: UPDATE tickets SET assignee_id = sub WHERE status NOT IN (fechados)
    API-->>W: 200 com o chamado atualizado
```

Numa sessão de 8 horas isso dá **uma** ida ao auth-service no login, **até 96** para manter a lista de nomes fresca (12 por hora, por réplica) e **nenhuma** nas ações que a pessoa faz na tela. O `@me` não aparece aqui de propósito: ele é token de filtro de fila, resolvido no `SELECT` do `/rows`, e não tem nada a ver com atribuir.

O JWT emitido pelo auth-service (ES256, assinado via AWS KMS) não pode ser validado localmente — não há JWKS público.
A API confia no cookie assinado (HMAC via `COOKIE_SECRET`) para garantir que o token não foi adulterado pelo cliente, e apenas decodifica o payload para ler `email`/`policies`/`exp`.

**Pré-requisito de infraestrutura**: a redirect URI `{APP_BASE_URL}/api/auth/google/callback` de cada ambiente (local, stag, prod) precisa estar registrada no client OAuth "Backoffice" do Google Cloud Console — o mesmo client usado pelo `tools`.

#### Autenticação de serviço (EI → Pipodesk)

O login acima serve para gente. O `enrollment-integrations` é um worker num pod: não tem navegador, não faz login e não tem cookie — e precisa abrir e acompanhar chamado.

Ele entra por outra porta, a mesma que todo serviço da Pipo usa:

1. O Kubernetes monta um token dentro de cada pod. O serviço lê esse arquivo e manda `Authorization: Bearer <token>`.
2. A API não valida esse token sozinha: manda para o `POST /api/verify-token` do listener interno do auth-service, junto da policy que a rota exige.
3. O auth-service resolve as claims do service account na identidade `<nome>.serviceaccount@piposaude.com.br`, confere as policies dela e devolve o `identity-id`.

**Não existe `client_id`/`client_secret` de serviço.** Quem vem do Cognito, do Keycloak ou de outro IdP espera um par de credenciais trocado por token no `/oauth2/token`. Aqui não há segredo estático para guardar, distribuir ou rotacionar: a prova de identidade é o token que o Kubernetes já emite para o pod, assinado pelo OIDC issuer do cluster (o provider do EKS) e renovado por ele. O auth-service verifica essa assinatura e traduz as claims na identidade da Pipo.

Isso não faz do token um dado inócuo: ele é uma credencial bearer, vale enquanto o `exp` valer e quem o tiver entra como o serviço. Não pode aparecer em log, em mensagem de erro nem em ticket — o `Authorization` já está na redaction do pino (`@pipo-os/observability`), e a API nunca escreve o token no corpo de uma resposta. O que limita o estrago é o prazo curto que o Kubernetes dá e a renovação automática, não a ausência de segredo.

Duas consequências de desenho que valem saber:

- **A autorização não viaja dentro do token.** As policies vivem na identidade e são consultadas a cada `verify-token`, então um `ppcli user remove-policy` vale já no request seguinte, sem esperar TTL. Em troca, cada request custa uma ida ao auth-service, e auth-service fora do ar vira `503` — por isso o guard de `serviceAllowed` recusa antes de tocar a rede.
- **Não há cache.** O interceptor Clojure da casa também não tem; cachear sem número de latência real seria otimizar por suposição.
- **O salto até o `verify-token` é HTTP dentro do cluster.** O listener interno do auth-service só fala HTTP na porta 4000, e é assim que todo BFF e serviço da casa o chama — a confidencialidade desse salto hoje é a rede do cluster, não TLS. Cifrar exige TLS no listener ou mTLS na malha, que é mudança no `platform/auth-service` e não aqui; enquanto isso, a API pelo menos recusa redirect nessa chamada, para o corpo com o token não ser reenviado a outro destino.

`client_id`/`client_secret` na Pipo aparece só em integração de **saída** com terceiro (a API do Bradesco, no `automated-enrollment-service`). Um chamador que não seja um pod — n8n, parceiro externo — não tem service account e portanto não tem esta porta.

O que a API cobra, em ordem, antes de deixar entrar:

| Guarda                                                       | Recusa                                                                                                                                                                                                                                 |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A rota declara `serviceAllowed: true` e a `policy` que exige | `403` — rota nova nasce fechada para serviço, e a recusa acontece antes de qualquer chamada de rede. `serviceAllowed` sem `policy` derruba o boot, porque mandaria o `verify-token` conferir identidade sem exigir autorização nenhuma |
| O token traz nome de service account                         | `401`                                                                                                                                                                                                                                  |
| O `<namespace>/<nome>` está em `SERVICE_ALLOWED_ACCOUNTS`    | `403` — o namespace entra na comparação porque o auth-service resolve a identidade só pelo nome, e um homônimo em outro namespace passaria                                                                                             |
| O auth-service reconhece a identidade e a policy             | `401` (credencial) ou `403` (identidade ou policy)                                                                                                                                                                                     |
| O auth-service responde                                      | `503`, nunca um 500 mudo                                                                                                                                                                                                               |

As rotas abertas a serviço são as quatro que abrir e acompanhar um chamado exige — criar, ler por id, procurar pelo `enrollmentId` (`GET /api/tickets?enrollmentId=…`, que é como o EI fica idempotente) e ler comentários — mais escrever comentário. A lista inteira é asserção em `apps/api/src/modules/auth/service-routes.test.ts`: abrir uma quinta é uma linha visível no diff.

Quem escreve como serviço fica registrado como `svc:<nome>` na coluna de autor, ao lado do `sub` de uma pessoa. Mudar status não está aberto a serviço: quem muda status é gente, e o caminho de volta para o EI é o webhook.

**Pré-requisito de infraestrutura**: a identidade `<nome>.serviceaccount@piposaude.com.br` precisa existir no auth-service de cada ambiente com a policy que as rotas de chamado exigem (ver [Autorização](#autorização)), concedida por `ppcli user add-policy`. Ligar `SERVICE_ALLOWED_ACCOUNTS` sem isso dá `403` no `verify-token`.

O `<nome>` da identidade no auth-service é o do ServiceAccount do pod, sem namespace — e no EI ele **não** é `enrollment-integrations`. Quem processa movimentação é o `--handler=enrollment`, que roda no namespace `cronjobs` com o service account `enrollment-integrations-worker`; o `enrollment-integrations` do `default` carrega só o `--handler=server`. A identidade, portanto, é `enrollment-integrations-worker.serviceaccount@piposaude.com.br`, e a entrada correspondente em `SERVICE_ALLOWED_ACCOUNTS` é `cronjobs/enrollment-integrations-worker` — com o namespace, que o auth-service descarta e a allowlist daqui não.

#### A API como chamadora: a lista de pessoas da Pipo

O caminho acima é o de entrada — um serviço provando quem é para a API. O de saída é o inverso, pelo mesmo mecanismo: para listar as pessoas da Pipo (`GET /api/users`), a API chama o `GET /api/users` do listener interno do auth-service apresentando o token do ServiceAccount do próprio pod, que o auth-service traduz na identidade `pipo-os.serviceaccount@piposaude.com.br`.

**Tamanho da lista, medido em produção em 15 set**: `total` = **627** pessoas com e-mail Pipo, ou sete páginas de 100. O teto do drain é 50 páginas (5.000 pessoas) e o aviso de aproximação sai na trigésima (3.000), então há folga de cerca de cinco vezes antes de alguém precisar olhar. É o que sustenta a rota devolver a lista inteira sem paginar: a resposta fica na casa de algumas dezenas de KB. Refazer a medição: `kubectl --context pipo-prod exec -n default deploy/pipo-os-api -- node -e '...fetch(".../api/users?limit=1")...'` e ler o `total`.

Esse token é lido do arquivo **a cada chamada**, porque o kubelet o rotaciona: uma cópia guardada no boot deixa de valer em algumas horas. Note que o pod monta dois tokens — o `aws-iam-token` ao lado dele é do IRSA, com a audience da AWS, e o auth-service não o reconhece. Fora do cluster não há arquivo nenhum, e é para isso que serve o `SERVICE_ACCOUNT_TOKEN`; sem nenhum dos dois a rota responde `503` e a interface cai no nome derivado do e-mail.

**Pré-requisito de infraestrutura**: a identidade `pipo-os.serviceaccount@piposaude.com.br` carrega `admin/allow/administrate/user/*` em stag e em prod (conferido em 14 set com `ppcli user list-policies`), que é a policy que a rota de lá exige. Sem ela a listagem responde `503`.

Essa policy é ampla: no `base.edn` do auth-service ela governa também `POST /api/user`, `PUT /api/user/:id` e `POST /api/user/:id/policy`. O pod do pipo-os passa a carregar, em produção, uma credencial capaz de anexar policy a qualquer identidade — nenhuma rota daqui usa isso, mas é o raio que um SSRF ou um vazamento de header neste serviço passa a ter. O caminho para reduzir é uma policy de leitura no auth-service (`admin/allow/read/user/*`), que hoje não existe.

O JWT da sessão da pessoa **não** é repassado nessa chamada, e não por comodidade: aquela policy abre, no mesmo `base.edn` do auth-service, o `POST /api/user/:id/policy`. Concedê-la a cada analista daria a ela o poder de anexar qualquer policy a qualquer identidade.

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
  -d '{"policies":["admin/allow/administrate/pipodesk/ticket"]}'
```

Essas garantias são cobertas por testes em `apps/api/src/modules/auth/dev-login.test.ts` — inclusive as que verificam a recusa no boot.

### Autorização

Autenticar responde quem é a pessoa; a **policy** responde o que ela pode fazer. As policies vêm dentro do JWT do auth-service e são declaradas por rota, em `config.policy`, no formato da Pipo — `{context}/{effect}/{action}/{domain}/{specific}`, com `admin`, `allow`, `administrate` e `*` como padrões das partes omitidas.

| Rotas                                                                                                  | Policy exigida                                |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `/api/tickets/**`, `/api/tickets/:id/comments`, `/api/tickets/:id/timeline`, `/api/queues/:id/tickets` | `admin/allow/administrate/pipodesk/ticket`    |
| `/api/groups/**` (estrutura: pods e membros)                                                           | `admin/allow/administrate/pipodesk/structure` |
| `/api/queues/**`, exceto `/api/queues/:id/tickets`                                                     | `pipodesk/ticket` **ou** `pipodesk/structure` |
| `/api/auth/**`                                                                                         | nenhuma (identidade, não recurso)             |
| `GET /api/users`, `GET /api/companies`                                                                 | `pipodesk/ticket` **ou** `pipodesk/structure` |

**Por que o domínio é `pipodesk` e não `ticket`.** `admin/allow/administrate/ticket/*` já existe e pertence a outro serviço: é o papel de admin do `ticket-service` (squad opex). Reusar a string acoplaria os dois — analista do Pipodesk viraria admin lá, e o admin de lá entraria aqui. O domínio próprio também deixa o específico livre para separar as duas famílias de rota: `ticket` para chamado e `structure` para grupos e filas, com `admin/allow/administrate/pipodesk/*` cobrindo as duas. O `authorize.test.ts` tem um caso que recusa a policy do `ticket-service` com 403, para a colisão não voltar por descuido.

O casamento é o mesmo do interceptor Clojure da casa (`com.piposaude.interceptors.auth.token`), em três regras:

- **O curinga vale só do lado da sessão**: quem tem `.../pipodesk/*` passa numa rota que pede `pipodesk/ticket`, e quem tem só `pipodesk/ticket` não passa numa que peça `pipodesk/structure`.
- **Policy mais curta casa pelo prefixo**: as partes que a sessão declara precisam bater, e as que ela omite não são perguntadas — é assim que `admin/allow/*/*`, o acesso total da Pipo, entra aqui como entra em qualquer serviço. O contrário não vale: policy mais longa que a exigida não passa.
- **`deny` recusa antes de qualquer `allow`**: uma policy `admin/deny/...` que nomeie exatamente a exigida pela rota fecha o acesso, mesmo que a sessão também carregue um `allow` mais amplo. É o padrão de exclusão que o auth-service emite. Uma rota que não declara `policy` fica a cargo apenas da autenticação, e o inventário em `apps/api/src/modules/auth/authorize.test.ts` lista todas — rota nova sem decisão deixa o teste vermelho.

Conceder e conferir é pelo `ppcli` (a identidade que roda precisa de `admin/allow/administrate/identity/*`):

```bash
eval "$(aws configure export-credentials --profile pipo --format env)" && \
  AWS_REGION=sa-east-1 ppcli user list-policies --email pessoa@piposaude.com.br -e stag

eval "$(aws configure export-credentials --profile pipo --format env)" && \
  AWS_REGION=sa-east-1 ppcli user add-policy --email pessoa@piposaude.com.br \
  --policy "admin/allow/administrate/pipodesk/*" -e stag
```

Os dois prefixos são obrigatórios e nenhum dispensa o outro. O `ppcli` **não resolve credencial de perfil SSO**: com `AWS_PROFILE=pipo` ele lê do perfil a região, não a credencial, e responde `AWS credentials not configured` — daí o `eval`, que materializa a credencial temporária no ambiente. E o `eval` **não exporta região**, então sozinho ele falha com `Invalid region: region was not a valid DNS name`; o bucket de secrets do `pipo-cli` fica em `sa-east-1`, e com outra região o S3 devolve `PermanentRedirect`, que não diz qual é a certa.

Antes do primeiro comando, `ppcli auth login -e <env>` (OAuth no navegador, com os mesmos prefixos). **O token é por ambiente**: o login de stag não habilita prod, e o sintoma é `credentials required: ... or run 'ppcli auth login' first` num comando que acabou de funcionar do outro lado. Se a sessão SSO tiver expirado, `aws sso login --profile pipo` antes de tudo.

Para liberar o Pipodesk a um time, é uma concessão por pessoa **e por ambiente** — não existe concessão por grupo. Com os dois logins feitos, o `eval` vale para a sessão inteira do shell e não precisa repetir por comando:

```bash
eval "$(aws configure export-credentials --profile pipo --format env)"

for email in pessoa1@piposaude.com.br pessoa2@piposaude.com.br; do
  for env in stag prod; do
    AWS_REGION=sa-east-1 ppcli user add-policy --email "$email" \
      --policy "admin/allow/administrate/pipodesk/*" -e "$env"
  done
done
```

O curinga `pipodesk/*` no lugar de `pipodesk/structure` é deliberado: cobre chamado e estrutura de uma vez e evita uma segunda concessão por pessoa quando surgir um terceiro segmento. Quem já tem `pipodesk/ticket` fica com as duas na lista — redundante e inofensivo, porque é um `allow` mais específico dentro do mesmo curinga, e só um `deny` mudaria o resultado.

Quem **não** recebe a policy passa a tomar `403` nas rotas de chamado e de estrutura, o que na interface é a lista de chamados e a árvore de pods inteiras vazias — então a lista de e-mails precisa estar fechada antes de a policy chegar à `main`, não depois.

Conceder **não** basta: a pessoa precisa refazer o login no Pipodesk. Diferente do caminho de serviço, que consulta o `verify-token` a cada request, a sessão de pessoa é o access-token guardado no cookie assinado, e `policies` sai das claims desse JWT (`extractSessionClaims`, em `modules/auth/session.ts`) — o que foi concedido depois do login só aparece no login seguinte, ou quando o token expira (`DEFAULT_SESSION_MAX_AGE_SECONDS`, 8 h). O mesmo vale ao remover: a sessão já aberta continua valendo até lá.

`GET /api/auth/me` devolve as policies da sessão, que é a forma mais rápida de conferir depois do relogin — e, se ele não foi feito, a forma mais rápida de descobrir que a sessão está com a lista antiga.

**Por que uma policy só para grupos.** Pod e membro de pod são a mesma superfície de administração — quem redesenha a hierarquia mexe nas duas —, então separar em `group` e `member` custaria duas concessões por pessoa para distinguir papéis que a V0 não tem. A leitura da estrutura exige a mesma policy da escrita pelo mesmo motivo: a árvore de pods diz quem atende o quê, e isso não é público dentro da Pipo.

**Por que as filas aceitam as duas.** Criar uma visão pessoal é ação de analista, e analista carrega a policy de chamado. A porta ficou aberta para as duas, e quem pode mexer em qual visão passou a ser decidido pela regra de dono e coordenação acima — não pela policy. Quem tem só `pipodesk/ticket` entra nas rotas e edita apenas as próprias visões pessoais — e as listagens (`GET /api/queues` e `/api/queues/counts`) mostram as visões do time e as suas, nunca a visão pessoal de outra pessoa. O papel do membro (`admin` ou `member`) já viajava no contrato e agora é lido também no servidor; `canEditQueue` no frontend é a segunda camada, sobre esta. `GET /api/queues/:id/tickets` segue exigindo a policy de chamado sozinha: mora no módulo de filas mas devolve `ticketListSchema`, e sem isso seria a porta lateral para a mesma lista.

**A policy é fronteira, a carteira é filtro.** Ter a policy de chamado diz que a identidade opera chamados — não _quais_. Restringir por empresa (a carteira do analista) é filtro de dados e ainda não existe: as rotas de listagem carregam o `TODO` correspondente e o trabalho está no ACE-147, que depende do módulo de usuários.

### Formato de erro

Todo erro da API responde com o mesmo corpo, o componente `ErrorResponse` do contrato:

```json
{
  "error": "ValidationFailedError",
  "message": "Ticket cannot be completed",
  "details": [{ "field": "members.0.taxId", "message": "Required", "code": "invalid_type" }]
}
```

`error` é o nome da classe de erro (contrato observado pelos testes), `message` é legível em inglês — a copy em pt-BR é do frontend — e `details` só aparece quando a falha é por campo: validação de payload (400) e recusa dos gates de conclusão (422). Um 422 de `UnprocessableEntityError` é violação de máquina de estados (chamado já fechado), e não traz `details`; um de `ValidationFailedError` traz todos os campos que falharam de uma vez, não o primeiro. Hoje ele sai em dois casos: o 400 de payload e o 422 de `groupId`, `queueId` ou `parentTicketId` apontando para uma linha que não existe — as três chaves estrangeiras que `POST` e `PATCH /api/tickets/:id` traduzem em erro por campo. Os gates de conclusão do PD-031 usarão o mesmo formato.

Limites de corpo, do mais externo para o mais interno: **1 MB** global (o mesmo corte do nginx-ingress), **256 KB** no `POST /api/tickets/:id/comments` e **50 mil caracteres** no campo `body` do comentário (o teto da rota é cinco vezes isso em bytes de UTF-8 cru, para que um texto de caracteres multibyte chegue à validação do campo em vez de esbarrar no limite de corpo; um cliente que escapa tudo em `\uXXXX` gasta 6 bytes por unidade e pode esbarrar no 413 antes). Passar dos dois primeiros responde `413`; passar do último responde `400` dizendo qual campo estourou.

### Payload de criação

`POST /api/tickets` recebe a movimentação que origina o ticket. Obrigatórios: `enrollmentId`, `enrollmentType`, `companyId`, `sourceSystem` e `enrollmentSnapshot` (o retrato da movimentação, guardado como jsonb). Opcionais: `alterationType`, `title`, `actionDate`, `origin`, `requester`, `collaborators`, `carrierId`, `carrierName`, `product`, `contractType`, `companySize`, `groupId`, `queueId`, `assigneeId`, `tags`, `forceCompletion` e `parentTicketId`. `status` não entra no corpo: o chamado nasce em `broker-processing`, e só o `PATCH /api/tickets/:id/status` o move.

#### O tipo da movimentação

O EI (enrollment-integrations) diz o que aconteceu em duas palavras: `request_type` (`inclusion`, `exclusion` ou `alteration`) e, quando é alteração, `alteration_type` (`plan`, `registration` ou `combined`). A fila conhece uma palavra só por tipo. A API traduz na entrada e grava a palavra canônica em `enrollment_type`; sem isso o chamado nascia com `alteration` na coluna e o filtro Tipo, que compara texto igual a texto, nunca o achava.

| O EI manda                                                            | A coluna guarda            |
| --------------------------------------------------------------------- | -------------------------- |
| `inclusion`, `exclusion`, ou uma palavra já canônica                  | a mesma palavra            |
| `alteration` + `plan`                                                 | `plan_change`              |
| `alteration` + `registration` (ou o alias legado `registration-data`) | `registration_data_change` |
| `alteration` + `combined`                                             | `combined_change`          |

O `alterationType` vem do corpo ou, na falta dele, do `alteration_type` do snapshot; o corpo vence. As duas palavras são lidas **sem distinção de caixa** — `Alteration` e `alteration` são a mesma coisa —, embora o contrato publique e a coluna guarde a forma minúscula; a leitura (`GET /api/tickets?enrollmentType=` e o filtro da fila) compara exatamente, porque a coluna já é a palavra canônica. `alteration` sem nenhum dos dois responde `422` com `code: required`, e um `alteration_type` no snapshot que a API não conhece responde `422` com `code: invalid`, os dois nomeando `alterationType`; uma palavra fora do vocabulário no corpo responde `400`, então um `request_type` novo no EI passa a exigir deploy desta API em vez de chegar cru a uma linha. A leitura continua devolvendo `enrollmentType` como texto, porque a coluna pode guardar dado anterior a esta regra. A fonte dos cinco valores é `apps/api/src/modules/tickets/enrollment-type.ts`, e `contract/ticket-vocabulary.json` prende o web a ter copy para cada um.

Status possíveis: `broker-processing`, `carrier-processing`, `broker-open-issue`, `missing-documents`, `incorrect-data`, `submitted-cancellation`, `completed` e `cancelled`. O contrato completo é o `openapi.json` (ver abaixo).

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

O registry `@piposaude` (GitHub Packages) exige autenticação mesmo para leitura; `pnpm install` no CI usa o secret `NODE_AUTH_TOKEN` (PAT com escopo `read:packages`) para isso. Localmente, configure o mesmo token em `~/.npmrc`. O `apps/web` depende de `@piposaude/design-system` desse registry, então sem o token o `pnpm install` falha também localmente.
