# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Motherboard is a multi-tenant platform for workspace management, communication plugins, and business automation. It's a polyrepo-in-monorepo structure: sub-repos are git submodules under the root workspace, coordinated via `go.work`.

**No Auth0.** Authentication is handled entirely by the internal `motherboard-core/services/auth` service using phone OTP, passkeys (WebAuthn), and OAuth.

## Repository Structure

```
Motherboard/                       ← root (this repo, go.work here)
  motherboard-api/                 ← Main Go + Gin API (port 8080 Docker)
  motherboard-web/                 ← Next.js 15 + React 18 frontend (port 4020)
  motherboard-core/services/
    auth/                          ← Auth/IAM service (port 8088)
    health/                        ← Health monitoring (port 8091)
    entitlement/                   ← Entitlement/quota service (port 8085)
    storage/                       ← File/asset storage via MinIO (port 8098)
    cloud-adapter/                 ← Third-party cloud integrations (port 8093)
  motherboard-commerce/services/
    billing/                       ← Billing/subscriptions (port 8090)
    inventory-management/          ← Inventory tracking (port 8096)
  motherboard-communications/services/
    notification/                  ← Email/SMS notifications (port 8094)
    marketing/                     ← Campaigns/newsletters (port 8092)
  motherboard-coordination/services/
    scheduler/                     ← Cron/background jobs
    chaukidar/                     ← File-watch event publisher
    config-manager/                ← Config management
  motherboard-infra/               ← Docker Compose files, Dockerfiles, seed scripts
  motherboard-shared/              ← Shared Go libs (bootstrapping, config, lifecycle, storage)
```

## Architecture

- **Multi-tenancy**: Workspace slugs resolve to ObjectIDs. Workspace context travels as `X-Workspace-ID` header (ObjectID hex) to the API, and as `workspaceSlug` JSON field to the auth service.
- **Auth flow**: Phone OTP → auth service → session_token cookie (or Bearer token). Auth service validates tokens; backend calls auth service via `AuthServiceMiddleware`.
- **Shared DB**: Both `motherboard-api` and `motherboard-core/services/auth` use MongoDB database `motherboard` on the same instance. Users live in the `users` collection.
- **RBAC**: Casbin policy enforcer in auth service. Roles/permissions stored in `roles` + `user_role_assignments` collections. The API calls `auth.CheckPermission` per request.
- **Events**: Redis Streams (`events.motherboard`).
- **Plugins**: Backend proxies requests to plugin microservices.

## Common Commands

### Frontend (from `motherboard-web/`)

```bash
npm run dev          # Dev server on port 4020
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # TypeScript type checking
npm test             # Vitest unit tests
npm run test:e2e     # Playwright E2E tests
```

### Backend API (from `motherboard-api/`)

```bash
go run main.go       # Run directly
go test ./...        # Tests
go build ./...       # Build check
```

### Auth Service (from `motherboard-core/services/auth/`)

```bash
go run cmd/server/main.go   # Run on port 8088
go test ./...
```

### Docker (full platform, from `motherboard-infra/`)

```bash
export DOCKER_BUILDKIT=1
cp .ports.env.example .ports.env   # first run only
docker compose -f docker-compose.yml up --build
# With local port overrides:
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

Frontend: http://localhost:4020 · Backend: http://localhost:8080 · Auth: http://localhost:8088

## Superuser Login Setup

The platform owner account uses phone `+918349780523`, workspace slug `tathya`.

**DB note**: Auth service defaults `DB_NAME=motherboard` (via `sharedConfig.DefaultDatabaseName`). Both the API and auth service share the `motherboard` database. The JS scripts in `motherboard-infra/scripts/` incorrectly target an `auth` DB — ignore those for the auth service; use `motherboard` DB for everything below.

### Step 1 — Start infrastructure

```bash
cd motherboard-infra
docker compose -f docker-compose.yml up mongodb redis minio -d
```

### Step 2 — Seed workspace + user (Go script)

```bash
cd motherboard-api
go run cmd/seed_mobile/main.go
# Creates: workspace "tathya" + user +918349780523, roles [admin, owner], phoneVerified: true
```

### Step 3 — Complete superuser setup via mongosh

The Go seed script does NOT set `isSuperuser` or create the RBAC role. Run these in mongosh:

```js
// mongosh mongodb://localhost:27017
use motherboard

// 1. Mark user as superuser
db.users.updateOne(
  { phone: "+918349780523" },
  { $set: { isSuperuser: true, roles: ["admin", "owner", "superuser"] } }
)

// 2. Get workspace ID
const ws = db.workspaces.findOne({ slug: "tathya" })
const wsId = ws._id

// 3. Create superuser role (Casbin p-rules source)
const roleId = new ObjectId()
db.roles.insertOne({
  _id: roleId,
  workspaceId: wsId,
  name: "superuser",
  description: "Full access to all resources",
  scope: "workspace",
  permissions: [
    { resource: "client",      actions: ["read","write","delete","manage"] },
    { resource: "integration", actions: ["read","write","delete","manage"] },
    { resource: "website",     actions: ["read","write","delete","manage"] },
    { resource: "workspace",   actions: ["read","write","delete","manage"] },
    { resource: "deployment",  actions: ["read","write","delete","manage"] },
    { resource: "user",        actions: ["read","write","delete","manage"] },
    { resource: "role",        actions: ["read","write","delete","manage"] },
    { resource: "analytics",   actions: ["read","manage"] },
  ],
  isSystem: true,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
})

// 4. Assign user to superuser role (Casbin g-rules source)
const user = db.users.findOne({ phone: "+918349780523" })
db.user_role_assignments.insertOne({
  workspaceId: wsId,
  userId: user._id,
  roleId: roleId,
  scope: "workspace",
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
})
```

### Step 4 — Login via OTP

```bash
# Start auth service if not in Docker:
# cd motherboard-core/services/auth && go run cmd/server/main.go

# 1. Generate OTP — in development mode, OTP is returned in response body
curl -X POST http://localhost:8088/api/auth/otp/generate \
  -H "Content-Type: application/json" \
  -d '{"phone":"+918349780523","workspaceSlug":"tathya"}'
# Response: { "success": true, "otp": "123456" }   ← only in dev mode

# 2. Verify OTP → get session_token cookie
curl -X POST http://localhost:8088/api/auth/otp/verify \
  -c cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"phone":"+918349780523","otp":"123456","workspaceSlug":"tathya"}'
# Sets: session_token cookie (168h expiry)
```

Or use frontend at http://localhost:4020, phone `+918349780523`, workspace `tathya`.

### Seed scripts reference

| Script | Purpose | DB targeted | Run with |
|--------|---------|-------------|---------|
| `motherboard-api/cmd/seed_mobile/main.go` | Workspace + user seed (your phone) | `motherboard` | `make superuser` |
| `motherboard-infra/scripts/init_platform.js` | Full platform wipe+seed (admin@motherboard.dev) | `motherboard` | `make seed-platform` |
| `motherboard-infra/scripts/seed_roles.js` | Superuser role + assignments | `motherboard` | `make seed-roles` |
| `motherboard-infra/scripts/seed_satellite_services.go` | Register microservices in registry | `motherboard` | `make seed-services` |
| `motherboard-infra/scripts/seed_oauth_clients.js` | Register motherboard-web OAuth client + all entitlements | `motherboard` | `make seed-oauth` |
| `motherboard-infra/scripts/push_client_envs.sh` | Push client env vars to config-manager + Chaukidar | — | `make push-envs` |

## Client Architecture

Each client (`{name}-mb/`) is a separate git repo containing:
- `motherboard.json` — registration contract (clientId + service URLs)
- `server/` — Node.js/Express backend (default port band 3100-3199)
- `ui/` — Next.js frontend
- `docs/` — client documentation

Shared Dockerfiles live in `motherboard-infra/docker/`:
- `Dockerfile.client-server` — Node.js multi-stage for `server/`
- `Dockerfile.client-ui` — Next.js multi-stage for `ui/`

### Network

The platform network has an explicit name `motherboard-platform` (set in `docker-compose.yml`). Client compose files must reference it as:

```yaml
networks:
  motherboard-network:
    external: true
    name: motherboard-platform
```

### Port bands

| Range | Assigned to |
|-------|------------|
| 27017 | MongoDB |
| 6379 | Redis |
| 9000-9001 | MinIO |
| 8080 | motherboard-api (backend) |
| 8085 | entitlement |
| 8088 | auth |
| 8090 | billing |
| 8091 | health |
| 8092 | marketing |
| 8093 | cloud-adapter |
| 8094 | notification |
| 8096 | inventory-management |
| 8098 | storage |
| 4020 | motherboard-web (CRM frontend) |
| 3100-3199 | Client `-mb` server/ui pairs |

### Discovery vs CRM

- **`motherboard-web`** — white-label CRM for all workspace clients (port 4020)
- **`Tathya-portfolio`** (`/Users/rupali.b/Documents/GitHub/Tathya/Tathya-portfolio/`) — Tathya's public discovery website, independent deployment
- **`Tathya-mb`** (`/Users/rupali.b/Documents/GitHub/Tathya/Tathya-mb/`) — Tathya's own CRM instance on Motherboard platform

### Startup order

```
1. infra        → mongodb, redis, minio
2. auth         → depends on mongodb
3. backend      → depends on mongodb, auth, redis
4. services     → health, billing, notification, etc.
5. frontend     → depends on backend (motherboard-web)
6. clients      → each {name}-mb via separate docker compose up
```

## Config Manager

`motherboard-coordination/services/config-manager/` manages env config with:
- **Category** dimension: `global/auth`, `global/database`, `global/services`, `motherboard/frontend`, `motherboard/styles`, `client:{name}/server`, `client:{name}/ui`
- **Environment** dimension: `local`, `development`, `preview`, `production`
- Chaukidar subscribes to `SyncEnv` commands from config-manager via Redis (`motherboard:commands:chaukidar`) and writes `.env.generated` files to target directories

Current status: in-memory only, needs MongoDB persistence. Port must not conflict with billing (8090).

## Infrastructure Dependencies

Local dev requires: MongoDB 7.0 (:27017), Redis 7 (:6379), MinIO (:9000/:9001).

## Key Environment Variables

### Auth service (`motherboard-core/services/auth/.env.local`)
`MONGODB_URI`, `DB_NAME` (default: `motherboard`), `JWT_SECRET`, `PORT` (default: 8088), `ENV`

### Backend API (`motherboard-api/.env.local`)
`CRM_MONGODB_URI`, `DATABASE_NAME` (default: `motherboard`), `AUTH_SERVICE_URL`, `JWT_SECRET`, `PORT`

## Testing

- Frontend: Vitest (unit) + Playwright (E2E), 70% coverage threshold.
- Backend/services: Go `testing` package, testcontainers-go for integration tests.
- Each sub-module tested independently with `go test ./...`.

## Code Quality

- Frontend: ESLint + Prettier + TypeScript strict + Husky pre-commit hooks.
- Backend: golangci-lint + go vet.
- Swagger annotations in Go handlers.

## Conventions

- Go services: `cmd/server/main.go` or `main.go` entry, `internal/` for private packages.
- Frontend: Radix UI, TanStack React Query, Zod, react-hook-form.
- Each microservice has its own `go.mod` + Dockerfile.
- Do not create documentation files unless explicitly requested.
