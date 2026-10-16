FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/db ./db
COPY --from=build --chown=node:node /app/scripts/db-migrate.mjs ./scripts/db-migrate.mjs
COPY --from=build --chown=node:node /app/scripts/import-research.mjs ./scripts/import-research.mjs
COPY --from=build --chown=node:node /app/scripts/research-import-core.mjs ./scripts/research-import-core.mjs
COPY --from=build --chown=node:node /app/scripts/import-oz-eb5.mjs ./scripts/import-oz-eb5.mjs
COPY --from=build --chown=node:node /app/scripts/oz-eb5-import-core.mjs ./scripts/oz-eb5-import-core.mjs
COPY --from=build --chown=node:node /app/scripts/oz2027-import.mjs ./scripts/oz2027-import.mjs
COPY --from=build --chown=node:node /app/scripts/oz2027-import-core.mjs ./scripts/oz2027-import-core.mjs
COPY --from=build --chown=node:node /app/scripts/oz2027-lib.mjs ./scripts/oz2027-lib.mjs
COPY --from=build --chown=node:node /app/scripts/debt-import.mjs ./scripts/debt-import.mjs
COPY --from=build --chown=node:node /app/scripts/debt-import-core.mjs ./scripts/debt-import-core.mjs
COPY --from=build --chown=node:node /app/scripts/debt-lib.mjs ./scripts/debt-lib.mjs
COPY --from=build --chown=node:node /app/scripts/start.mjs ./scripts/start.mjs
USER node
EXPOSE 3000
CMD ["node", "scripts/start.mjs"]
