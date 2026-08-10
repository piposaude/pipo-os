FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY apps/api apps/api
COPY apps/web apps/web
RUN pnpm --filter ./apps/api build
RUN pnpm --filter ./apps/web build
RUN pnpm --filter ./apps/api deploy --prod --legacy /app/deploy/api

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/deploy/api ./
COPY --from=build /app/apps/web/dist ./public
EXPOSE 3001
ENV NODE_ENV=production
CMD ["node", "dist/server.js"]
