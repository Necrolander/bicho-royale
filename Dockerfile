FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3010
CMD ["sh", "-c", "npm run db:seed && npx next start --hostname 0.0.0.0 --port 3010"]
