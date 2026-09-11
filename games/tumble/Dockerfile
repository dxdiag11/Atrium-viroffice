# Tumble Rush — build from the REPO ROOT, not this folder, because the game
# requires ../serve.js (the shared https-helper one level up in games/):
#   docker build -f games/tumble/Dockerfile -t atrium-tumble .
# (docker-compose.yml does this for you)
FROM node:20-alpine AS deps
WORKDIR /app/games/tumble
COPY games/tumble/package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
COPY games/serve.js ./games/serve.js
WORKDIR /app/games/tumble
COPY --from=deps /app/games/tumble/node_modules ./node_modules
COPY games/tumble/package*.json ./
COPY games/tumble/server.js ./
COPY games/tumble/public/ ./public/

EXPOSE 3300
CMD ["node", "server.js"]
