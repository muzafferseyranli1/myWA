FROM node:22-alpine
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV NODE_ENV=development
COPY package.json package-lock.json* ./
RUN npm install --include=dev
COPY . .
RUN npx prisma generate && npm run build
ENV NODE_ENV=production
ENV PORT=3060
RUN mkdir -p /app/public/uploads
EXPOSE 3060
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "scripts/entrypoint.sh"]
