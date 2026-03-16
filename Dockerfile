# Stage 1: Build TypeScript
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# Stage 2: Production image
FROM node:20-alpine

WORKDIR /app

# Install sqlite backup tool
RUN apk add --no-cache sqlite

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist
COPY public/ ./public/

# Data volume for SQLite
RUN mkdir -p /data /backups
VOLUME ["/data", "/backups"]

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/data/wavedge.db

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
