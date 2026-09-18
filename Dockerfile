FROM node:22-alpine
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --include=dev
COPY . .
RUN npx prisma generate && npm run build
ENV PORT=3060
RUN mkdir -p /app/public/uploads
EXPOSE 3060
CMD ["sh", "scripts/entrypoint.sh"]
