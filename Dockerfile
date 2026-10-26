# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates gosu \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
RUN DATABASE_URL=file:/tmp/build.db npx prisma generate
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
COPY server ./server
RUN npm run build
RUN npm prune --omit=dev

FROM base AS production
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=file:/data/forge.db \
    SEED_ON_START=false
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/src/catalog.js ./src/catalog.js
COPY --chown=node:node package.json package-lock.json ./
COPY docker/entrypoint.sh /usr/local/bin/forge-entrypoint
RUN chmod 755 /usr/local/bin/forge-entrypoint \
 && mkdir -p /data && chown node:node /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["forge-entrypoint"]
CMD ["node", "server/index.js"]
