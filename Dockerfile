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

# Public demo (Render free tier, see render.yaml): on every boot it applies migrations,
# re-seeds the demo account and serves the app. Uploads live on the container's disk, so
# they reset with it; the demo account's own data is recreated by the seed each time.
FROM build AS demo
# The seed draws its sample screenshots and bills from SVG text, which needs real fonts.
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/* \
 && cp -r .next/static .next/standalone/.next/static \
 && mkdir -p uploads && chown node:node uploads \
 && ln -s /app/uploads .next/standalone/uploads
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=10000 \
    DEMO_LOGIN=true STORAGE_DRIVER=local
USER node
EXPOSE 10000
# Links and auth use the public URL; Render provides it as RENDER_EXTERNAL_URL.
# The seed runs on mock AI so a boot never spends model calls or depends on Groq being up.
CMD ["sh", "-c", "export NEXTAUTH_URL=\"${NEXTAUTH_URL:-$RENDER_EXTERNAL_URL}\" APP_URL=\"${APP_URL:-${NEXTAUTH_URL:-$RENDER_EXTERNAL_URL}}\" && npx prisma migrate deploy && AI_MOCK=true npx tsx prisma/seed.ts && exec node .next/standalone/server.js"]
