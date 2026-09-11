# Gaple — build from the REPO ROOT, not this folder, because the game requires
# ../serve.js (the shared https-helper one level up in games/):
#   docker build -f games/gaple/Dockerfile -t atrium-gaple .
# (docker-compose.yml does this for you)
FROM node:20-alpine AS deps
WORKDIR /app/games/gaple
COPY games/gaple/package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
COPY games/serve.js ./games/serve.js
WORKDIR /app/games/gaple
COPY --from=deps /app/games/gaple/node_modules ./node_modules
COPY games/gaple/package*.json ./
COPY games/gaple/server.js ./
COPY games/gaple/public/ ./public/

EXPOSE 3200
CMD ["node", "server.js"]
