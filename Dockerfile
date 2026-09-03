FROM node:20-alpine

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Disable telemetry and set build environment
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://mywa:MyWA_Secure_2026!@localhost:5432/mywa"

# Copy package manifests
COPY package.json package-lock.json* ./

# Install ALL dependencies including build tools
RUN npm install --include=dev

# Copy all source files
COPY . .

# Generate Prisma client and build Next.js app
RUN npx prisma generate
RUN npm run build

# Runtime configuration
ENV NODE_ENV=production
ENV PORT=3060

# Ensure runtime directories exist
RUN mkdir -p /app/.baileys_auth /app/public/uploads

EXPOSE 3060

CMD ["npx", "tsx", "server/index.ts"]
