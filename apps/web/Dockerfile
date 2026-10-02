FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc* ./
COPY packages ./packages
COPY apps/web/package.json ./apps/web/package.json
COPY db ./db
RUN pnpm install --frozen-lockfile || pnpm install

FROM deps AS build
COPY apps/web ./apps/web
COPY tsconfig.base.json ./
RUN pnpm --filter @6frame/config build \
 && pnpm --filter @6frame/contracts build \
 && pnpm --filter @6frame/evaluators build \
 && pnpm --filter @6frame/web build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN corepack enable
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public 2>/dev/null || true
COPY --from=build /app/db ./db
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/apps/web/src/scripts ./apps/web/src/scripts
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
