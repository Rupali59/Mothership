# Shared Dockerfile for Go Services
# Highly optimized for build speed and memory consumption

# Stage 1: Build Stage
FROM golang:1.25-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git gcc musl-dev

WORKDIR /app

# Copy root workspace files for dependency resolution (libs, pkg for replace directives)
COPY go.mod go.sum ./
COPY libs/ libs/
COPY pkg/ pkg/

# Copy apps/ and services/ for replace directives (e.g. backend requires services/health)
COPY apps/ apps/
COPY services/ services/

# Build arguments provided by docker-compose
ARG SERVICE_PATH
ARG MAIN_PATH=cmd/server/main.go
# MAIN_PATH: backend uses main.go, health uses ., others use cmd/server/main.go

# Disable workspace - use service's go.mod only so we don't need all go.work modules
ENV GOWORK=off

# Download dependencies from service directory (replace directives resolve via ../../pkg, etc.)
WORKDIR /app/${SERVICE_PATH}
RUN go mod download

# Build the service with memory optimizations
# -mod=mod: ignore vendor, use module cache (vendor may be out of sync)
# -p 1: limit parallelism to reduce peak memory usage
# -v: verbose output to help debug build issues
# When MAIN_PATH is ".", build from current dir; otherwise build the specified path
RUN set -e && \
    if [ "${MAIN_PATH}" = "." ]; then \
      CGO_ENABLED=0 GOOS=linux go build -mod=mod -v -p 1 -o /bin/service .; \
    else \
      CGO_ENABLED=0 GOOS=linux go build -mod=mod -v -p 1 -o /bin/service ./${MAIN_PATH}; \
    fi

# Stage 2: Runtime Stage
FROM alpine:3.18

# Add certificates for HTTPS calls
RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app

# Copy binary from builder
COPY --from=builder /bin/service /app/service

# Default environment variables
ENV APP_ENV=production

# Expose port (overridden by docker-compose)
EXPOSE 8080

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-8080}/readyz || exit 1

ENTRYPOINT ["/app/service"]
