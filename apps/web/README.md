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
  styles/            tokens de operação do Pipodesk (--desk-*) e o CSS global
tests/unit           espelha src/
tests/integration    uma suíte por fluxo, renderizando a routeTree real com fetch mockado
tests/fixtures       a massa dos testes, um recorte dos dados do protótipo
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

## Referência de produto

O comportamento-alvo é o protótipo `pipodesk`. Divergência visual ou de regra
entre os dois é bug aqui, salvo decisão registrada no plano.

**Base do protótipo: `7279ccf` (8 set 2026)**, o commit com que as telas foram
sincronizadas pela última vez. Para re-sincronizar, ao menos uma vez
por semana: `git log 7279ccf..origin/main -- pipodesk/src` no repositório do
protótipo lista o que mudou; portar e atualizar este commit.

**O commit-base diz de onde partir, não o que já foi portado.** Ele marca a
última rodada, e uma rodada pode ter deixado ponto para trás — na rodada de 14
set o `returnTo` da fila, que existe no protótipo desde `aaad394`, muito antes
do commit-base, nunca tinha sido portado, e sair da busca caía sempre em Meus tickets.
A lista de commits pega o que é novo; o que ficou para trás só aparece
conferindo o código dos dois lados, e o mesmo vale ao contrário: a rodada de 14
set achou a DSP-120 já implementada aqui antes de o commit chegar ao commit-base.

Plano e backlog: [Pipodesk no Notion](https://app.notion.com/p/3cd4744bd8038168bb39d69ed7252d4d);
tickets no Linear, projeto “Pipodesk no PipOS”.
