# Stage 1 — build Next.js static export (UI identik dengan mcp-sqlserv)
FROM node:20-alpine AS webbuild
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/tsconfig.json web/next.config.ts web/components.json ./
COPY web/src ./src
COPY web/public ./public
RUN npx next build

# Stage 2 — runtime: node http server + next static export
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY src ./src
COPY --from=webbuild /app/out ./web/out
EXPOSE 3000
CMD ["node", "src/server.js"]
