FROM node:20-alpine AS builder
WORKDIR /app

# Install openssl needed by Prisma on Alpine Linux
RUN apk add --no-cache openssl

# Copy package files and install ALL deps (including devDependencies for build)
COPY package*.json ./
RUN npm ci

# Copy source and prisma schema
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Compile TypeScript to dist/
RUN npm run build

# ─── Production image ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl

# Copy only production artifacts
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules

# Ensure uploads directory exists
RUN mkdir -p /app/uploads

EXPOSE 3000
CMD ["node", "dist/main"]
