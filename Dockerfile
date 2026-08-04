# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV CI=true

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .
RUN npm test

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    BUROBALL_DATA_DIR=/data \
    WRANGLER_SEND_METRICS=false

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY docker/wrangler.jsonc ./wrangler.jsonc
COPY docker/entrypoint.sh /usr/local/bin/buroball-entrypoint

RUN chmod +x /usr/local/bin/buroball-entrypoint \
    && mkdir -p /data \
    && chown -R node:node /app /data

USER node
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["buroball-entrypoint"]
