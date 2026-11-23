# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN MONGOMS_DISABLE_POSTINSTALL=1 npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
ENV LIGHTHOUSE_RUNTIME_CONFIG=/run/lighthouse/runtime.json
RUN addgroup -S lighthouse && adduser -S lighthouse -G lighthouse
COPY --from=build --chown=lighthouse:lighthouse /app/package*.json ./
COPY --from=build --chown=lighthouse:lighthouse /app/node_modules ./node_modules
COPY --from=build --chown=lighthouse:lighthouse /app/dist ./dist
COPY scripts/runtime-config.mjs ./runtime-config.mjs
USER lighthouse
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node","--import","./runtime-config.mjs","dist/index.js"]
