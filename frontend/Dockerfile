# ---- build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

# One build serves every tenant domain: the browser uses relative /api URLs.
# The Django address is baked into the /api rewrites (next.config.js).
ARG INTERNAL_API_URL=http://backend:8000
ENV INTERNAL_API_URL=$INTERNAL_API_URL \
    NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM node:20-alpine AS runner
WORKDIR /app
# HOSTNAME=0.0.0.0 is required so nginx can reach the standalone server.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 PORT=3000

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
