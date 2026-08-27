# Step 1: Build & Server environment
FROM node:20-alpine

WORKDIR /app

# Copy root package files
COPY package*.json ./
RUN npm install --production=false

# Copy client package files & build client
COPY client/package*.json ./client/
RUN cd client && npm install

COPY . .

# Build Vite React client
RUN npm run build:client

# Remove devDependencies to optimize image size
RUN npm prune --production

EXPOSE 5000

ENV PORT=5000
ENV NODE_ENV=production

CMD ["node", "server/index.js"]
