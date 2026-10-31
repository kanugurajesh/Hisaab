# syntax=docker/dockerfile:1

FROM node:22-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# One-off job image: `prisma migrate deploy` against Cloud SQL before each release.
FROM deps AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
# Only used with STORAGE_DRIVER=local; production stores proofs in GCS.
RUN mkdir -p uploads && chown node:node uploads
USER node
EXPOSE 8080
CMD ["node", "server.js"]
