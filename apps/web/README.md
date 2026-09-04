# pipo-os — frontend (`apps/web`)

Interface web do PipOS. Hoje ela serve o **Pipodesk**, o help-desk de
movimentações do time de Ops. São três telas: a fila operacional na raiz (`/`),
o detalhe do chamado em `/tickets/:id` e a página do time em `/teams/:groupId`.

O setup do monorepo (Node, pnpm, Postgres, variáveis de ambiente, login em
desenvolvimento) está no [README da raiz](../../README.md). Aqui fica só o que
é específico do frontend.

## Tecnologias

| Camada            | Escolha                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| Bundler           | [Vite](https://vitejs.dev) + React 18 + TypeScript                                                     |
| Rotas             | [TanStack Router](https://tanstack.com/router) file-based (`src/routes/`; `routeTree.gen.ts` é gerado) |
| Dados da API      | TanStack Query via `@pipo-os/api-client`, tipado a partir do OpenAPI                                   |
| Estado de cliente | Zustand só para a sessão; o estado da fila é um reducer em `lib/pipodesk/queue-view.ts`                |
| Estilo            | CSS Modules + tokens `--pipo-*` do `@piposaude/design-system`; sem Tailwind                            |
| Testes            | Vitest + Testing Library                                                                               |
| Observabilidade   | Sentry via `@pipo-os/observability`                                                                    |

## Como iniciar

Além do que o README da raiz pede:

1. Token do GitHub Packages para instalar o design system, em `~/.npmrc`
   (classic PAT com escopo `read:packages`):

   ```ini
   //npm.pkg.github.com/:_authToken=SEU_TOKEN
   ```

2. Compilar o pacote de observabilidade, que a API e o web importam do `dist/`:

   ```bash
   pnpm --filter @pipo-os/observability build
   ```

Depois, `pnpm dev` na raiz sobe API (:3001) e web (:5173), com proxy de `/api`
para a API. Só o frontend: `pnpm --filter pipo-os-frontend dev`.

Em desenvolvimento a tela de login tem o botão **Entrar como usuário local**,
que dispensa o Google. Detalhes em
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
  routes/            rotas file-based (routeTree.gen.ts é gerado, não editar)
  pages/             o corpo de cada tela (queue, ticket, team, auth/login)
  components/
    pipodesk/        sidebar, fila, shell, Popover e ícones do Pipodesk
    ui/              primitivos sem domínio (TextArea)
  lib/pipodesk/      lógica pura do domínio, sem React: filtro, ordenação,
                     árvore da sidebar, status, janela de datas, patches, busca
  constants/         toda a copy pt-BR, por tela
  fixtures/pipodesk/ o dataset mockado (ver abaixo)
  styles/            tokens de operação do Pipodesk (--desk-*) e o CSS global
tests/unit           espelha src/
tests/integration    uma suíte por fluxo, renderizando a routeTree real com fetch mockado
```

## Convenções

- **URL em inglês, interface em português.** `/teams/pod-1?tab=portfolios` na
  barra; “Carteiras” na tela.
- **A API tem oito status; a tela mostra seis.** `lib/pipodesk/status.ts` é o
  único tradutor entre os dois.
- **`lib/pipodesk/ticket-row.ts` é o único módulo que lê o
  `enrollment_snapshot`.**
- **A contagem de um nó da sidebar é a lista que a tela monta ao clicar nele.**
  Há teste de integração para isso.
- Componente do design system sempre que existir; primitivo local só para o que
  o DS não tem (Popover e os ícones do Pipodesk).

## Dados: fixture do protótipo

O frontend ainda não está ligado à API de tickets. Fila, time e detalhe leem
`src/fixtures/pipodesk/dataset.json`, gerado a partir do protótipo `pipodesk`
(repositório `prototipos`, ao lado deste) com o vocabulário já traduzido para o
da API.

- Regerar, a partir da raiz do `pipo-os`:
  `cd ../prototipos/pipodesk && pnpm exec tsx scripts/export-pipo-os.ts <caminho-do-json>`
- Ações na tela (reatribuir, mudar status, prioridade, agendar) aplicam um patch
  local (`lib/pipodesk/patches.ts`); recarregar volta ao dataset.
- O “hoje” é fixo (campo `today` do dataset), para a fila ser reproduzível em
  teste e screenshot.

## Referência de produto

O comportamento-alvo é o protótipo `pipodesk`. Divergência visual ou de regra
entre os dois é bug aqui, salvo decisão registrada no plano.

**Base do protótipo: `44f1185` (3 set 2026)**, o commit com que a fixture e as
telas foram sincronizadas pela última vez. Para re-sincronizar, ao menos uma vez
por semana: `git log 44f1185..origin/main -- pipodesk/src` no repositório do
protótipo lista o que mudou; regerar o dataset e atualizar este commit.

Plano e backlog: [Pipodesk no Notion](https://app.notion.com/p/3cd4744bd8038168bb39d69ed7252d4d);
tickets no Linear, projeto “Pipodesk no PipOS”.
