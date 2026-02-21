# Shared Dockerfile for Client Servers (Node.js / Express)
# Multi-stage build optimized for production
# Based on user request

FROM node:18-alpine AS dependencies

WORKDIR /app

# Copy only package files to leverage Docker cache layers
COPY package*.json ./

# Use npm ci for reproducible, locked dependency installation
RUN npm ci --only=production


# Development stage: full deps, npm run dev (Next.js frontend, jhora, vedika, etc.)
FROM node:18-alpine AS development

WORKDIR /app

COPY package*.json ./

# Install all deps (including devDependencies) for development
RUN npm install

COPY . .

# Default CMD; apps override via docker-compose (e.g. frontend uses port 4020)
EXPOSE 4020
CMD ["npm", "run", "dev"]


FROM node:18-alpine AS runtime

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

# Copy production dependencies from builder stage
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy source code
COPY --chown=nodejs:nodejs . .

# Switch to non-root user
USER nodejs

# Expose port (default 3001, but docker-compose overrides)
EXPOSE 3001

# Add health check that respects PORT env var and checks /health endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3001) + '/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start command
CMD ["npm", "start"]
