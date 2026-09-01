# pipo-os — frontend (`apps/web`)

Interface web do PipOS. Hoje ela serve uma aplicação: o **Pipodesk**, o
help-desk de movimentações do time de Ops Geben que substitui o Zendesk. A fila
operacional é a raiz (`/`); o detalhe do chamado vive em `/tickets/:id` e a
página de time em `/teams/:groupId`.

## Tecnologias

| Camada            | Escolha                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime/bundler   | [Vite](https://vitejs.dev) + React 18 + TypeScript                                                                                           |
| Rotas             | [TanStack Router](https://tanstack.com/router) file-based (`src/routes/`, árvore gerada em `routeTree.gen.ts`)                               |
| Dados de servidor | TanStack Query via `@pipo-os/api-client` (openapi-fetch + openapi-react-query, tipos gerados do OpenAPI da API)                              |
| Estado de cliente | Zustand **só para sessão** (`src/stores/session.ts`); o estado da fila vive num reducer próprio (`lib/pipodesk/queue-view.ts`)               |
| Estilo            | CSS Modules + tokens `--pipo-*` do `@piposaude/design-system`. **Sem Tailwind.**                                                             |
| Design system     | `@piposaude/design-system` (GitHub Packages — precisa de token, ver abaixo)                                                                  |
| Testes            | Vitest + Testing Library (unit em `tests/unit`, integração em `tests/integration` renderizando a `routeTree` real com `createMemoryHistory`) |
| Observabilidade   | Sentry via `@pipo-os/observability`                                                                                                          |

## Como iniciar

### Pré-requisitos

- **Node ≥ 22.9** e **pnpm 11** (`npm i -g pnpm`).
- **Token do GitHub Packages** para o design system: um classic PAT com escopo
  `read:packages`, em `~/.npmrc`:

  ```
  //npm.pkg.github.com/:_authToken=SEU_TOKEN
  ```

- **Docker** para o Postgres da API (o login passa pela API, então o frontend
  sozinho não abre sessão).

### Passo a passo (na raiz do repositório)

```bash
pnpm install
docker compose up -d          # Postgres 17 em localhost:5432
pnpm --filter @pipo-os/observability build   # a API importa o dist/
pnpm dev                      # sobe API (:3001) e web (:5173) em paralelo
```

Abra `http://localhost:5173` (se a 5173 estiver ocupada o Vite pula para a
5174 — ele avisa no terminal). O Vite faz proxy de `/api` para a API na 3001.

Em desenvolvimento o botão **“Entrar como usuário local”** aparece na tela de
login — o `pnpm dev` da API já sobe com `DEV_LOGIN_ENABLED=true`, sem OAuth do
Google. Nunca defina essa flag em ambiente publicado; a API se recusa a subir.

Só o frontend (com a API já de pé): `pnpm --filter pipo-os-frontend dev`.

### Scripts

| Comando                                        | O que faz                     |
| ---------------------------------------------- | ----------------------------- |
| `pnpm dev`                                     | servidor de desenvolvimento   |
| `pnpm test` / `test:unit` / `test:integration` | Vitest                        |
| `pnpm typecheck`                               | `tsc --noEmit`                |
| `pnpm lint`                                    | ESLint com `--max-warnings 0` |
| `pnpm build`                                   | build de produção + typecheck |
| `pnpm storybook`                               | Storybook na :6006            |

## Onde as coisas moram

```
src/
  routes/           rotas file-based (a árvore em routeTree.gen.ts é GERADA — não editar)
  pages/            o corpo de cada tela (queue, ticket, team, auth/login)
  components/
    pipodesk/       sidebar, fila, shell, primitivos (Popover/Collapsible), ícones
  lib/pipodesk/     a lógica pura do domínio: filtro, ordenação, árvore da
                    sidebar, status 8↔6, janela de datas, patches, busca…
                    É aqui que os testes de regra vivem — nada importa React.
  constants/        toda a copy pt-BR, por tela
  fixtures/pipodesk/ o dataset mockado (ver abaixo)
  styles/           tokens de operação do Pipodesk (--desk-*) e o global mínimo
tests/unit          espelha lib/ e components/
tests/integration   uma suíte por fluxo, com a routeTree real e fetch mockado
```

## Convenções que não estão escritas em mais nenhum lugar

- **URL em inglês, interface em português.** Caminho, chave e valor de search
  param são identificadores técnicos (`/teams/pod-1?tab=portfolios`); o
  português fica na copy (a aba se chama “Carteiras” na tela).
- **Oito status na API, seis na tela.** `lib/pipodesk/status.ts` é o único
  tradutor; nenhuma tela inventa mapa próprio.
- **`lib/pipodesk/ticket-row.ts` é o único módulo que conhece o formato do
  `enrollment_snapshot`** (kebab/snake/camel — o contrato fecha na RFC PD-001).
- **A contagem de um nó da sidebar é a lista que a tela monta.** Escopo do nó →
  janela → filtro, nessa ordem, nas duas superfícies. Há teste de integração
  prendendo o invariante ponta a ponta.
- Componente do design system sempre que existir; primitivo local só para o que
  o DS ainda não tem (Popover com Esc/clique-fora, Collapsible, ícones do
  Pipodesk) — cada lacuna tem ticket (PD-310…PD-314).

## Os dados são mockados — e são os do protótipo

Enquanto o backend da fila não existe (PD-011/PD-043/PD-050), a fila, o time e
o detalhe leem `src/fixtures/pipodesk/dataset.json`: **o dataset gerado pelo
protótipo `prototipos/pipodesk`, exportado de lá** com o vocabulário já
traduzido (6 status + motivo → os 8 da API). Mesmas contagens (GEBEN 6.749,
Meus tickets 662, Inbox 31), mesmas pessoas, mesmas empresas — de propósito,
para comparar as duas aplicações lado a lado.

- Regerar após mexer no mock do protótipo:
  `cd ../prototipos/pipodesk && pnpm exec tsx scripts/export-pipo-os.ts <caminho-do-json>`
- Ações (reatribuir, status, prioridade, agendar) usam **patch local**
  (`lib/pipodesk/patches.ts`): a base é imutável, recarregar volta ao estado
  conhecido. Quando `PATCH /tickets` existir, o patch vira o corpo da chamada.
- A “hoje” das fixtures é fixa (`2026-08-07`) para a fila ser reproduzível em
  teste e screenshot.

## Referência de produto

O comportamento-alvo é o protótipo em `prototipos/pipodesk` (rodando:
`pnpm dev` lá, porta 5173). Divergência visual ou de regra entre os dois é bug
aqui, salvo decisão registrada no plano. O backlog completo, com o que cada
tela ainda não tem, está no Linear (projeto “Pipodesk no PipOS”) e nos
documentos do planejamento.
