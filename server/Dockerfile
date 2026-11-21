FROM node:22.12-bookworm-slim

ENV NODE_ENV=production
WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit

COPY --chown=node:node . .

USER node
EXPOSE 8080
CMD ["node", "index.js"]
