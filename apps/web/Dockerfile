# syntax=docker/dockerfile:1
# The web app as a standalone Next.js server. Build from the repository root:
#   docker build -f apps/web/Dockerfile --build-arg API_URL=http://api:3000 -t stay-flow-web .

FROM node:24.22-alpine AS build
RUN corepack enable
WORKDIR /repo
# Every workspace manifest, so pnpm can check the lockfile; only the web app's packages get installed.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @stay-flow/web... --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/web apps/web
# Where the server reaches the API. Next.js writes the /v1 rewrite into the build, so it is set here.
ARG API_URL=http://api:3000
ENV API_URL=$API_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @stay-flow/contracts build && pnpm --filter @stay-flow/web build

FROM node:24.22-alpine
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3001
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static apps/web/.next/static
USER node
EXPOSE 3001
CMD ["node", "apps/web/server.js"]
