# Penyusup — build from the REPO ROOT, not this folder, because the game
# requires ../serve.js (the shared https-helper one level up in games/):
#   docker build -f games/impostor/Dockerfile -t atrium-penyusup .
# (docker-compose.yml does this for you)
FROM node:20-alpine AS deps
WORKDIR /app/games/impostor
COPY games/impostor/package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
COPY games/serve.js ./games/serve.js
WORKDIR /app/games/impostor
COPY --from=deps /app/games/impostor/node_modules ./node_modules
COPY games/impostor/package*.json ./
COPY games/impostor/server.js ./
COPY games/impostor/map.js ./
COPY games/impostor/public/ ./public/

EXPOSE 3500
CMD ["node", "server.js"]
