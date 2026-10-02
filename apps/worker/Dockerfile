FROM mcr.microsoft.com/playwright:v1.51.0-jammy
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc* ./
COPY packages ./packages
COPY apps/worker ./apps/worker
COPY tsconfig.base.json ./
RUN pnpm install \
 && pnpm --filter @6frame/config build \
 && pnpm --filter @6frame/contracts build \
 && pnpm --filter @6frame/evaluators build \
 && pnpm --filter @6frame/worker build
ENV NODE_ENV=production
CMD ["node", "apps/worker/dist/index.js"]
