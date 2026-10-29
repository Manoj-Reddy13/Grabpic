FROM node:20-alpine AS dependencies

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package*.json ./
COPY --from=dependencies /app/node_modules ./node_modules
COPY src ./src

EXPOSE 8080

USER node

CMD ["node", "src/server.js"]
