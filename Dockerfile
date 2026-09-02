FROM node:20-alpine AS base
RUN apk add --no-cache openssl
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# Build the application
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Production runner
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3060

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 mywa

# Copy built app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server ./server
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/lib ./src/lib

# Create directories for persistent data
RUN mkdir -p /app/.baileys_auth /app/public/uploads
RUN chown -R mywa:nodejs /app/.baileys_auth /app/public/uploads /app

USER mywa

EXPOSE 3060

CMD ["npx", "tsx", "server/index.ts"]
