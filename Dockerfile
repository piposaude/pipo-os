FROM node:22-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM node:22-alpine AS backend-builder
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci
COPY backend/ .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=frontend-builder /app/dist ./public
EXPOSE 3001
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
