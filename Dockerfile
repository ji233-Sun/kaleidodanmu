# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN npm install -g pnpm@11 --no-fund --no-audit
WORKDIR /app

# ---- 安装依赖 ----
FROM base AS deps
# better-sqlite3 无预编译包时需要从源码构建
RUN apk add --no-cache python3 make g++
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/sdk/package.json packages/sdk/
COPY packages/cli/package.json packages/cli/
COPY packages/template/package.json packages/template/
RUN pnpm install --frozen-lockfile

# ---- 构建 ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ---- 运行 ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# standalone 追踪不会为 serverExternalPackages 生成顶层链接，手动补齐
RUN cd node_modules && for pkg in better-sqlite3 typeorm; do \
      [ -e "$pkg" ] || ln -s "$(ls -d .pnpm/$pkg@*/node_modules/$pkg | head -1)" "$pkg"; \
    done

# SQLite 与用户上传产物目录（建议挂载卷到 /app/data）
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
VOLUME ["/app/data"]

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
