# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/common/package*.json ./packages/common/
COPY packages/server/package*.json ./packages/server/
COPY packages/client/package*.json ./packages/client/

# Install all dependencies
RUN npm install

# Copy source code
COPY packages/common ./packages/common
COPY packages/server ./packages/server
COPY packages/client ./packages/client
COPY tsconfig.json ./

# Build all packages
RUN npm run build:common
RUN npm run build:server
RUN npm run build:client

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/common/package*.json ./packages/common/
COPY packages/server/package*.json ./packages/server/

# Install only production dependencies
RUN npm install --production

# Copy built files from builder
COPY --from=builder /app/packages/common/dist ./packages/common/dist
COPY --from=builder /app/packages/common/package.json ./packages/common/
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/client/dist ./packages/client/dist

# Expose port
EXPOSE 8080

# Start server
CMD ["node", "packages/server/dist/index.js"]
