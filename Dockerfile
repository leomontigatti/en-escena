FROM node:22-slim AS base

WORKDIR /app
ENV NODE_ENV=production

FROM base AS build

ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM base AS runtime

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build

EXPOSE 3000

CMD ["node", "node_modules/@react-router/serve/bin.js", "./build/server/index.js"]
