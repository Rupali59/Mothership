# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Motherboard is a multi-tenant platform for workspace management, communication plugins, and business automation. It's a polyglot monorepo with a Next.js frontend, Go backend, and multiple Go microservices/plugins orchestrated via Docker Compose.

## Architecture

- **apps/frontend/** — Next.js 15 + React 18 + TypeScript frontend (port 4020 dev)
- **apps/core-server/** — Go + Gin backend API (port 4021 local, 8080 Docker)
- **services/** — Independent Go microservices (auth, billing, notification, scheduler, health, entitlement, storage, task-tracker, marketing, cloud-adapter)
- **plugins/** — Communication/payment plugins: email (8081), sms (8082), whatsapp (8083), telegram (8084), stripe, razorpay, inventory, orders
- **go.work** — Go workspace file coordinating modules across core, plugins, and services

Multi-tenant isolation uses workspace slugs (X-Workspace-Slug header) with RBAC. Services communicate via HTTP; events flow through Redis Streams (`events.motherboard`). The backend proxies requests to plugins.

## Common Commands

### Frontend (from `apps/frontend/`)

```bash
npm run dev          # Dev server with Turbo on port 4020
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # TypeScript type checking
npm run check        # Lint + typecheck
npm test             # Vitest unit tests
npm run test:e2e     # Playwright E2E tests
npm run format       # Prettier formatting
```

### Backend (from `apps/core-server/`)

```bash
make dev             # Hot-reload dev server (Air) on port 4021
make run             # Run on port 4021 (auto-kills conflicting process)
make build           # Compile binary
make test            # go test -v ./...
make lint            # golangci-lint
make fmt             # go fmt
make swagger         # Generate Swagger docs (accessible at /swagger/index.html)
make install-tools   # Install air, golangci-lint, swag
make check-env       # Validate .env configuration
make deps            # go mod download && go mod tidy
```

### Docker (full platform)

```bash
docker compose -f docker-compose.dev.yml up                 # Platform services
docker compose -f docker-compose.dev.yml -f docker-compose.clients.dev.yml up  # With clients
./deploy.sh local up     # Scripted local deployment with health checks
./deploy.sh local down   # Stop all services
```

## Infrastructure Dependencies

Local dev requires: MongoDB 7.0 (:27017), Redis 7 (:6379), MinIO (:9000/:9001). All provided via `docker-compose.dev.yml`.

## Key Environment Variables

Backend `.env` in `apps/core-server/`: `CRM_MONGODB_URI`, `CRM_DB_NAME`, `API_KEY`, `JWT_SECRET`, `PORT`, `ENV`. Run `make check-env` to validate.

## Testing

- Frontend uses Vitest with jsdom and 70% coverage thresholds. E2E via Playwright.
- Backend uses Go's `testing` package with testcontainers-go for integration tests (in `tests/integration/`).
- Each service has its own `go.mod` and can be tested independently with `go test ./...`.

## Code Quality

- Frontend: ESLint + Prettier + TypeScript strict mode + Husky pre-commit hooks
- Backend: golangci-lint + go vet + pre-commit hooks (`make install-pre-commit`)
- Swagger annotations in Go handler functions, regenerate with `make swagger`

## Conventions

- Go services follow the pattern: `main.go` entry point, `internal/` for private packages (database, repository, middleware, rbac, context, logger, configuration)
- Frontend uses Radix UI components, TanStack React Query for server state, Zod for validation, react-hook-form for forms
- Each microservice and plugin is a standalone Go module with its own Dockerfile
- Do not create documentation files unless explicitly requested (per project .cursorrules)
