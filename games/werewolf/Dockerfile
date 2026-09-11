# Werewolf — build from the REPO ROOT, not this folder, because the game
# requires ../serve.js (the shared https-helper one level up in games/):
#   docker build -f games/werewolf/Dockerfile -t atrium-werewolf .
# (docker-compose.yml does this for you)
FROM node:20-alpine AS deps
WORKDIR /app/games/werewolf
COPY games/werewolf/package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
COPY games/serve.js ./games/serve.js
WORKDIR /app/games/werewolf
COPY --from=deps /app/games/werewolf/node_modules ./node_modules
COPY games/werewolf/package*.json ./
COPY games/werewolf/server.js ./
COPY games/werewolf/public/ ./public/

EXPOSE 3400
CMD ["node", "server.js"]
