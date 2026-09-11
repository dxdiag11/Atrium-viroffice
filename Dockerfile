# Atrium — the office itself. Build from the repo root:
#   docker build -t atrium .
# (docker-compose.yml does this for you)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY server.js ./
COPY public/ ./public/
COPY assets/ ./assets/

# HTTPS turns on by itself if /app/certs/{key,cert}.pem exist (see docker-compose.yml);
# otherwise this serves plain http, same as running it outside Docker.
EXPOSE 3100
CMD ["node", "server.js"]
