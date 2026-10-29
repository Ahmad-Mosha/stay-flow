# syntax=docker/dockerfile:1
# The API and the worker share this image; the command picks one. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t stay-flow-api .

FROM node:24.22-alpine AS base
RUN corepack enable
WORKDIR /repo
# Every workspace manifest, so pnpm can check the lockfile; only the API's packages get installed.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY e2e/package.json e2e/

FROM base AS build
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @stay-flow/api... --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN pnpm --filter @stay-flow/contracts build && pnpm --filter @stay-flow/api build

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @stay-flow/api... --ignore-scripts

FROM node:24.22-alpine
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=prod-deps /repo/node_modules node_modules
COPY --from=prod-deps /repo/packages/contracts/node_modules packages/contracts/node_modules
COPY --from=prod-deps /repo/apps/api/node_modules apps/api/node_modules
COPY --from=build /repo/packages/contracts/package.json packages/contracts/
COPY --from=build /repo/packages/contracts/dist packages/contracts/dist
COPY --from=build /repo/apps/api/package.json apps/api/
COPY --from=build /repo/apps/api/dist apps/api/dist
WORKDIR /repo/apps/api
USER node
EXPOSE 3000
CMD ["node", "--enable-source-maps", "dist/main.js"]
