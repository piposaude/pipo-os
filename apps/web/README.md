# pipo-os — frontend (`apps/web`)

Interface web do PipOS. Hoje ela serve uma aplicação: o **Pipodesk**, o
help-desk de movimentações do time de Ops Geben que substitui o Zendesk. A fila
operacional é a raiz (`/`); o detalhe do chamado vive em `/tickets/:id` e a
página de time em `/teams/:groupId`.

O setup do monorepo (Node, pnpm, Postgres, variáveis de ambiente, login em
desenvolvimento) está no [README da raiz](../../README.md). Aqui fica só o que
é específico do frontend.

## Tecnologias

| Camada            | Escolha                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime/bundler   | [Vite](https://vitejs.dev) + React 18 + TypeScript                                                                                                |
| Rotas             | [TanStack Router](https://tanstack.com/router) file-based (`src/routes/`, árvore gerada em `routeTree.gen.ts`)                                    |
| Dados de servidor | TanStack Query via `@pipo-os/api-client` (openapi-fetch + openapi-react-query, tipos gerados do OpenAPI da API)                                   |
| Estado de cliente | Zustand **só para sessão** (`src/stores/session.ts`); o estado da fila vive num reducer próprio (`lib/pipodesk/queue-view.ts`)                    |
| Estilo            | CSS Modules co-locados + tokens `--pipo-*` do `@piposaude/design-system`. **Sem Tailwind.** (Exceção: a tela de login usa um `style.css` global.) |
| Design system     | `@piposaude/design-system` (GitHub Packages — precisa de token, ver abaixo)                                                                       |
| Testes            | Vitest + Testing Library (unit em `tests/unit`, integração em `tests/integration` renderizando a `routeTree` real com `createMemoryHistory`)      |
| Observabilidade   | Sentry via `@pipo-os/observability`                                                                                                               |

## Como iniciar

Além do que o README da raiz pede, o frontend precisa de duas coisas:

- **Token do GitHub Packages** para o design system: um classic PAT com escopo
  `read:packages`, em `~/.npmrc`. Sem ele o `pnpm install` falha ao resolver
  `@piposaude/design-system`.

  ```ini
  //npm.pkg.github.com/:_authToken=SEU_TOKEN
  ```

- **`@pipo-os/observability` compilado.** API e web importam o `dist/` do
  pacote, e o `pnpm install` não o gera:

  ```bash
  pnpm --filter @pipo-os/observability build
  ```

Feito isso, `pnpm dev` na raiz sobe API (:3001) e web (:5173). O Vite faz proxy
de `/api` para a 3001; se a 5173 estiver ocupada ele pula para a 5174 e avisa
no terminal. Só o frontend, com a API já de pé:
`pnpm --filter pipo-os-frontend dev`.

Em desenvolvimento o botão **“Entrar como usuário local”** aparece na tela de
login: o `pnpm dev` da API já sobe com `DEV_LOGIN_ENABLED=true`. As garantias
em volta desse atalho (por que ele não chega a produção, o que a API recusa)
estão em
[Autenticação em desenvolvimento](../../README.md#autenticação-em-desenvolvimento).

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

```text
src/
  routes/           rotas file-based (a árvore em routeTree.gen.ts é GERADA — não editar)
  pages/            o corpo de cada tela (queue, ticket, team, auth/login)
  components/
    pipodesk/       sidebar, fila, shell, o primitivo Popover e os ícones do Pipodesk
    ui/             primitivos sem domínio (TextArea)
  lib/pipodesk/     a lógica pura do domínio: filtro, ordenação, árvore da
                    sidebar, status 8↔6, janela de datas, patches, busca…
                    É aqui que os testes de regra vivem — nada importa React.
  constants/        toda a copy pt-BR, por tela
  fixtures/pipodesk/ o dataset mockado (ver abaixo)
  styles/           tokens de operação do Pipodesk (--desk-*) e o global mínimo
tests/unit          espelha src/ (lib, components, stores, styles, fixtures)
tests/integration   uma suíte por fluxo, com a routeTree real e fetch mockado
```

## Convenções que não estão escritas em mais nenhum lugar

- **URL em inglês, interface em português.** Caminho, chave e valor de search
  param são identificadores técnicos (`/teams/pod-1?tab=portfolios`); o
  português fica na copy (a aba se chama “Carteiras” na tela).
- **Oito status na API, seis na tela.** `lib/pipodesk/status.ts` é o único
  tradutor; nenhuma tela inventa mapa próprio.
- **`lib/pipodesk/ticket-row.ts` é o único módulo que conhece o formato do
  `enrollment_snapshot`** (kebab/snake/camel — o contrato ainda não está
  congelado; a RFC é o PD-001 do plano).
- **A contagem de um nó da sidebar é a lista que a tela monta.** Escopo do nó →
  janela → filtro, nessa ordem, nas duas superfícies. Há teste de integração
  prendendo o invariante ponta a ponta.
- Componente do design system sempre que existir; primitivo local só para o que
  o DS ainda não tem (Popover com Esc/clique-fora e os ícones do Pipodesk) —
  cada lacuna está registrada no plano (PD-310…PD-314).

## Os dados são mockados — e são os do protótipo

A API já tem CRUD de tickets, filtros de listagem, grupos e filas, mas o
frontend ainda não está ligado a ela: faltam a projeção leve da fila
(`GET /api/tickets/rows`, em andamento na ACE-181) e a costura do lado do web
(PD-102). Até lá, a fila, o time e o detalhe leem
`src/fixtures/pipodesk/dataset.json`: **o dataset gerado pelo protótipo
`pipodesk`, exportado de lá** com o vocabulário já traduzido (6 status + motivo
→ os 8 da API) e as 26 views que a árvore do protótipo tem hoje. Mesmas
contagens (GEBEN 6.749, Meus tickets 662, Inbox 31),
mesmas pessoas, mesmas empresas — de propósito, para comparar as duas
aplicações lado a lado.

- Regerar após mexer no mock do protótipo, a partir da raiz do `pipo-os` (o
  repositório `prototipos` fica ao lado deste, não dentro):
  `cd ../prototipos/pipodesk && pnpm exec tsx scripts/export-pipo-os.ts <caminho-do-json>`
- Ações (reatribuir, status, prioridade, agendar) usam **patch local**
  (`lib/pipodesk/patches.ts`): a base é imutável, recarregar volta ao estado
  conhecido. Quando o web for ligado à API, o patch vira o corpo de
  `PATCH /api/tickets/:id` e `PATCH /api/tickets/:id/status`, que já existem.
- A “hoje” das fixtures é fixa (`2026-08-07`, campo `today` do dataset) para a
  fila ser reproduzível em teste e screenshot.

## Referência de produto

O comportamento-alvo é o protótipo `pipodesk`, no repositório `prototipos` ao
lado deste (`pnpm dev` lá sobe na 5173, a mesma porta do web — quem roda os
dois vê um deles na 5174). Divergência visual ou de regra entre os dois é bug
aqui, salvo decisão registrada no plano.

**Base do protótipo: `44f1185` (3 set 2026).** É o commit de que a fixture e
as telas foram sincronizadas pela última vez; a regra acima só é verificável
contra ele. Re-sincronizar a cada DSP fechada que mude contrato ou estrutura,
ou ao menos uma vez por semana: `git log 44f1185..origin/main -- pipodesk/src`
no repositório do protótipo lista o que mudou; depois, regerar o dataset e
atualizar este commit.

O backlog vive em dois lugares que se referenciam. O plano do Pipodesk
([backlog no Notion](https://app.notion.com/p/3cd4744bd8038168bb39d69ed7252d4d))
numera os itens como `PD-nnn`; o Linear, projeto “Pipodesk no PipOS”, tem os
tickets executados (`ACE-nnn`), e cada um cita o PD que entrega. Os `PD-nnn`
deste README são IDs do plano, não chaves do Linear.
