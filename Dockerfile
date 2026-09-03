FROM node:20-alpine

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Build and runtime environment variables
ENV NODE_ENV=production
ENV PORT=3060
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://mywa:MyWA_Secure_2026!@localhost:5432/mywa"

# Copy manifests
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy all source files
COPY . .

# Generate Prisma client and build Next.js
RUN npx prisma generate
RUN npm run build

# Ensure runtime directories exist
RUN mkdir -p /app/.baileys_auth /app/public/uploads

EXPOSE 3060

CMD ["npx", "tsx", "server/index.ts"]
