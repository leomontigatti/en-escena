FROM node:22-bookworm-slim AS base

WORKDIR /app
ENV NODE_ENV=production
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

FROM base AS build

ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM base AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends awscli ca-certificates curl \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  && printf '%s\n' \
    'Types: deb' \
    'URIs: https://apt.postgresql.org/pub/repos/apt' \
    'Suites: bookworm-pgdg' \
    'Components: main' \
    'Signed-By: /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc' \
    > /etc/apt/sources.list.d/pgdg.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-17 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/scripts ./scripts

EXPOSE 3000

CMD ["node", "node_modules/@react-router/serve/bin.js", "./build/server/index.js"]
