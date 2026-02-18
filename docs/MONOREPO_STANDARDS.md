# Monorepo Standards: Port Assignment, Initialization, Chaukidar Consistency & Cross-Language Best Practices

> This document defines the standard operating procedures for the Motherboard monorepo.
> It covers how to add new services/plugins/clients, how ports are managed, how Chaukidar
> detects and provisions new projects, and how to enforce consistency across Go and TypeScript codebases.

---

## Table of Contents

1. [Port Assignment Strategy](#1-port-assignment-strategy)
2. [Service Initialization & Scaffolding](#2-service-initialization--scaffolding)
3. [Environment Variable Management](#3-environment-variable-management)
4. [Chaukidar Consistency Analysis](#4-chaukidar-consistency-analysis)
5. [Cross-Language Best Practices](#5-cross-language-best-practices)
6. [Adding a New Component: Complete Checklist](#6-adding-a-new-component-complete-checklist)

---

## 1. Port Assignment Strategy

### 1.1 Current State

Ports are managed through three independent mechanisms that can conflict:

**A. Static Registry** — `tools/update_ports.py`
A Python script that updates `.env` files across all services. It contains a `SERVICES` dict mapping paths to ports (lines 8-62). However, it uses **stale directory paths**:

| Stale Path in Script | Actual Path |
|---------------------|-------------|
| `Motherboard/core/motherboard-server` | `Motherboard/apps/core-server` |
| `Motherboard/core/frontend` | `Motherboard/apps/admin-dashboard` |
| `Motherboard/services/notification-service` | `Motherboard/services/notification` |
| `Motherboard/services/inventory-management` | `Motherboard/plugins/inventory` |
| `Motherboard/services/order-management` | `Motherboard/plugins/orders` |
| `Motherboard/plugins/telephony/whatsapp` | `Motherboard/plugins/whatsapp` |
| `Motherboard/plugins/telephony/telegram` | `Motherboard/plugins/telegram` |

**B. Docker Compose** — `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.local.yml`
Each service's port is set via `environment: - PORT=XXXX` and exposed via `ports: - "XXXX:XXXX"`. These are authoritative at runtime but require manual synchronization with `.env` files.

**C. Chaukidar Dynamic Assignment** — `services/scheduler/internal/services/chaukidar/project.go:54-57`
When Chaukidar detects a new client project, it auto-assigns a port by finding the maximum existing port in MongoDB and incrementing:

```go
// project.go lines 54-57
port, err := s.getNextAvailablePort(ctx)
```

This operates independently from both the static registry and docker-compose — **there is no collision check against the static port bands**.

**D. Per-Service Defaults** — Each `config.go` has a hardcoded fallback:
```go
// billing: config.go:48
Port: getEnv("PORT", "8082"),
// notification: config.go:24
Port: getEnv("PORT", "8094"),
// storage: config.go:32
Port: getEnv("PORT", "8098"),
```

### 1.2 Current Port Registry

| Band | Range | Purpose |
|------|-------|---------|
| Frontend | 3000 | Next.js admin dashboard |
| Local Dev | 4020-4021 | Frontend dev (4020), Backend dev (4021) |
| Client UIs | 3100, 3102, 3104... | Even numbers for UI |
| Client Servers | 3101, 3103, 3105... | Odd numbers for server |
| Client Assets | 3126-3145 | Additional client apps |
| Communication Plugins | 8081-8084 | Email, SMS, WhatsApp, Telegram |
| Entitlement | 8085 | RBAC/Casbin service |
| Payment Plugins | 8086-8087 | Razorpay, Stripe |
| Auth Service | 8088 | Standalone auth |
| Scheduler | 8089 | Job scheduler |
| Business Services | 8090-8098 | Billing, Health, Marketing, Cloud, Notification, Storage, Inventory, Orders |
| Chaukidar Dynamic | 5000+ | Auto-assigned client ports |
| Infrastructure | 6379, 9000-9001, 27017 | Redis, MinIO, MongoDB |
| Backend (Docker) | 8080 | Core server |

### 1.3 Proposed Standard: Canonical Port Registry

Create a single source of truth at `ports.json`:

```json
{
  "$schema": "Motherboard port registry — single source of truth",
  "bands": {
    "infrastructure": { "min": 6379, "max": 27017, "note": "Fixed ports: Redis 6379, MinIO 9000-9001, MongoDB 27017" },
    "core": { "min": 3000, "max": 4021, "note": "Frontend 3000, dev 4020-4021, backend 8080" },
    "services": { "min": 8081, "max": 8099, "note": "Microservices and plugins" },
    "clients_static": { "min": 3100, "max": 3199, "note": "Client UI/server pairs" },
    "clients_dynamic": { "min": 5000, "max": 5099, "note": "Chaukidar auto-provisioned" }
  },
  "assignments": {
    "apps/core-server": 8080,
    "apps/admin-dashboard": 3000,
    "plugins/email": 8081,
    "plugins/sms": 8082,
    "plugins/whatsapp": 8083,
    "plugins/telegram": 8084,
    "services/entitlement": 8085,
    "plugins/razorpay": 8086,
    "plugins/stripe": 8087,
    "services/auth": 8088,
    "services/scheduler": 8089,
    "services/billing": 8090,
    "services/health": 8091,
    "services/marketing": 8092,
    "services/cloud-adapter": 8093,
    "services/notification": 8094,
    "services/storage": 8098,
    "plugins/inventory": 8096,
    "plugins/orders": 8097
  }
}
```

**MongoDB as source of truth:** The canonical port registry is stored in MongoDB in a **separate config database** so it can be shared and kept distinct from app/tenant data.

| Setting | Default | Env (scheduler / tools) |
|--------|---------|--------------------------|
| Database | `motherboard_config` | `PORT_REGISTRY_DATABASE` |
| Collection | `port_registry` | `PORT_REGISTRY_COLLECTION` |

Document: `{ "_id": "default", "bands": {...}, "assignments": {...} }`. Connection uses `MONGODB_URI` (or `MONGO_URI`); the scheduler and port-registry CLI use the same database and collection names above.

**Port-registry CLI (Go):** The Go binary at `cmd/port-registry` is the only implementation. Run from repo root:
- `make sync-ports` or `go run ./cmd/port-registry sync` — sync `ports.json` into MongoDB (required to seed the registry before validate/update)
- `make validate-ports` or `go run ./cmd/port-registry validate` — check collisions and docker-compose (reads from MongoDB only)
- `make update-ports` or `go run ./cmd/port-registry update` — update `.env` (or .env.local, etc.) with `PORT=` per assignment (reads from MongoDB only)

Validate and update require the registry to exist in MongoDB; run `sync-ports` first if needed. The scheduler's `getNextAvailablePort()` reads the `clients_dynamic` band from the port registry collection in the config database.

**Rules:**
1. All new services MUST claim a port from the port registry (MongoDB; or `ports.json` then run `sync-ports`) before writing any config
2. Port registry MUST be read from MongoDB (Go CLI: validate/update; sync loads from `ports.json` and writes to MongoDB)
3. Chaukidar's `getNextAvailablePort()` MUST read the `clients_dynamic` band from MongoDB `port_registry` (or fallback 5000–5099)
4. A CI validation script checks `docker-compose*.yml` ports match the port registry

### 1.4 Fixing `tools/update_ports.py`

The script needs two fixes:

**Fix 1: Update stale paths** (lines 10-28)
```python
SERVICES = {
    # Core & Services
    "Motherboard/apps/core-server": 8080,         # was core/motherboard-server
    "Motherboard/apps/admin-dashboard": 3000,      # was core/frontend
    "Motherboard/services/entitlement": 8085,
    "Motherboard/services/billing": 8090,
    "Motherboard/services/health": 8091,
    "Motherboard/services/marketing": 8092,
    "Motherboard/services/cloud-adapter": 8093,
    "Motherboard/services/notification": 8094,     # was notification-service
    "Motherboard/plugins/inventory": 8096,         # was services/inventory-management
    "Motherboard/plugins/orders": 8097,            # was services/order-management
    "Motherboard/services/storage": 8098,
    # Plugins
    "Motherboard/plugins/email": 8081,
    "Motherboard/plugins/sms": 8082,
    "Motherboard/plugins/whatsapp": 8083,          # was telephony/whatsapp
    "Motherboard/plugins/telegram": 8084,          # was telephony/telegram
    "Motherboard/plugins/razorpay": 8086,
    "Motherboard/plugins/stripe": 8087,
    # ...clients unchanged...
}
```

**Fix 2: Read from `ports.json`** — Replace the hardcoded `SERVICES` dict with `json.load(open("ports.json"))`.

---

## 2. Service Initialization & Scaffolding

### 2.1 Current State: No Scaffolding

There is no scaffolding tool. Each service was created by copy-pasting another, leading to drift in patterns:

| Service | Config Pattern | Server Pattern | Logger |
|---------|---------------|----------------|--------|
| `apps/core-server` | `godotenv` + massive struct (377 lines) | Manual `http.Server` | `zap` via `internal/logger` |
| `services/billing` | `godotenv` + simple struct | Manual `http.Server` + `killProcessOnPort` | `log` (stdlib) |
| `services/notification` | `os.Getenv` + inline func | Manual `http.Server` + WaitGroup | `zap.Sugar()` |
| `services/storage` | `godotenv` + simple struct | Manual `http.Server` | `log` (stdlib) |
| `services/auth` | `godotenv` + struct | `lifecycle.New()` | `zap` |
| `services/marketing` | env-only | `lifecycle.New()` | `zap` |
| `services/cloud-adapter` | env-only | `lifecycle.New()` | `zap` |

**Problems:**
- 6+ copies of `getEnv()` across the codebase
- Only 3 of 10+ Go services use `lifecycle.New()` (the shared graceful lifecycle server)
- Config field naming varies: `MongoDBURI` vs `MongoURI`, `DatabaseName` vs `DBName`
- Some services use `log` (stdlib), others `zap`, others `zap.Sugar()`

### 2.2 Proposed Standard: Config Package

Create `pkg/config/env.go` as a shared utility:

```go
package config

import (
    "os"
    "strconv"
    "time"
)

// GetEnv returns the value of an environment variable, or a default.
func GetEnv(key, defaultValue string) string {
    if v := os.Getenv(key); v != "" {
        return v
    }
    return defaultValue
}

// MustGetEnv returns the value or panics if unset and no default given.
func MustGetEnv(key string) string {
    v := os.Getenv(key)
    if v == "" {
        panic("required environment variable not set: " + key)
    }
    return v
}

// GetEnvInt returns an int env var with a default.
func GetEnvInt(key string, defaultValue int) int {
    if v := os.Getenv(key); v != "" {
        if i, err := strconv.Atoi(v); err == nil {
            return i
        }
    }
    return defaultValue
}

// GetEnvBool returns a bool env var with a default.
func GetEnvBool(key string, defaultValue bool) bool {
    if v := os.Getenv(key); v != "" {
        return v == "true" || v == "1" || v == "yes"
    }
    return defaultValue
}

// GetEnvDuration parses a duration env var (e.g., "30s", "5m").
func GetEnvDuration(key string, defaultValue time.Duration) time.Duration {
    if v := os.Getenv(key); v != "" {
        if d, err := time.ParseDuration(v); err == nil {
            return d
        }
    }
    return defaultValue
}
```

### 2.3 Proposed Standard: Service Template

Every new Go service (service or plugin) MUST use `lifecycle.New()` and follow this `main.go` pattern:

```go
package main

import (
    "github.com/gin-gonic/gin"
    "github.com/joho/godotenv"
    "go.uber.org/zap"

    "github.com/Rupali59/motherboard-monorepo/pkg/lifecycle"
    "github.com/<module>/internal/config"
    "github.com/<module>/internal/handlers"
)

func main() {
    _ = godotenv.Load()
    cfg := config.Load()

    logger, _ := zap.NewProduction()
    defer logger.Sync()

    if cfg.Env == "development" {
        gin.SetMode(gin.DebugMode)
    } else {
        gin.SetMode(gin.ReleaseMode)
    }

    r := gin.New()
    r.Use(gin.Recovery())

    // Register routes
    handlers.RegisterRoutes(r, cfg)

    // Use lifecycle.New for graceful startup/shutdown with probes
    srv := lifecycle.New(r, cfg.Port, logger)
    srv.MarkReady()
    if err := srv.Run(); err != nil {
        logger.Fatal("server error", zap.Error(err))
    }
}
```

### 2.4 Directory Structure Convention

```
services/<name>/                    # or plugins/<name>/
├── cmd/server/main.go              # Entry point (optional if simple, can use root main.go)
├── main.go                         # Entry point (simple services)
├── Dockerfile
├── go.mod
├── go.sum
├── .env.example                    # Template with all vars documented
├── .env.development                # Dev defaults
├── .env.local                      # Git-ignored, local overrides
├── internal/
│   ├── config/
│   │   └── config.go               # Uses pkg/config helpers
│   ├── handlers/
│   │   └── routes.go               # RegisterRoutes(r, cfg)
│   ├── repository/                  # MongoDB data access
│   └── services/                    # Business logic
└── README.md                        # Optional, for complex services
```

### 2.5 Scaffolding Script

Create `tools/scaffold-service.sh`:

```bash
#!/bin/bash
# Usage: ./tools/scaffold-service.sh <type> <name> <port>
# type: service | plugin | client
# Example: ./tools/scaffold-service.sh service analytics 8095

TYPE=$1  # service, plugin
NAME=$2  # e.g., "analytics"
PORT=$3  # e.g., 8095

if [ -z "$TYPE" ] || [ -z "$NAME" ] || [ -z "$PORT" ]; then
    echo "Usage: $0 <service|plugin> <name> <port>"
    exit 1
fi

case $TYPE in
    service) BASE_DIR="services/$NAME" ;;
    plugin)  BASE_DIR="plugins/$NAME" ;;
    *)       echo "Unknown type: $TYPE"; exit 1 ;;
esac

# Validate port not already in use
if grep -q "\"$PORT\"" ports.json 2>/dev/null; then
    echo "ERROR: Port $PORT already assigned in ports.json"
    exit 1
fi

# Create directory structure
mkdir -p "$BASE_DIR/internal/config"
mkdir -p "$BASE_DIR/internal/handlers"
mkdir -p "$BASE_DIR/internal/repository"
mkdir -p "$BASE_DIR/internal/services"

# Generate config.go
cat > "$BASE_DIR/internal/config/config.go" << 'GOEOF'
package config

import (
    "github.com/joho/godotenv"
    pkgconfig "github.com/Rupali59/motherboard-monorepo/pkg/config"
)

type Config struct {
    Port         string
    Env          string
    MongoDBURI   string
    DatabaseName string
}

func Load() *Config {
    _ = godotenv.Load()
    return &Config{
        Port:         pkgconfig.GetEnv("PORT", "PORT_PLACEHOLDER"),
        Env:          pkgconfig.GetEnv("APP_ENV", "development"),
        MongoDBURI:   pkgconfig.GetEnv("MONGODB_URI", "mongodb://localhost:27017"),
        DatabaseName: pkgconfig.GetEnv("DATABASE_NAME", "motherboard"),
    }
}
GOEOF
sed -i '' "s/PORT_PLACEHOLDER/$PORT/" "$BASE_DIR/internal/config/config.go"

# Generate main.go (uses lifecycle.New)
cat > "$BASE_DIR/main.go" << 'GOEOF'
package main

import (
    "github.com/gin-gonic/gin"
    "go.uber.org/zap"
    "github.com/Rupali59/motherboard-monorepo/pkg/lifecycle"
    "MODULE_PATH/internal/config"
)

func main() {
    cfg := config.Load()
    logger, _ := zap.NewProduction()
    defer logger.Sync()

    r := gin.New()
    r.Use(gin.Recovery())

    srv := lifecycle.New(r, cfg.Port, logger)
    srv.MarkReady()
    if err := srv.Run(); err != nil {
        logger.Fatal("server error", zap.Error(err))
    }
}
GOEOF

# Generate .env.example
echo "PORT=$PORT" > "$BASE_DIR/.env.example"
echo "APP_ENV=development" >> "$BASE_DIR/.env.example"
echo "MONGODB_URI=mongodb://localhost:27017" >> "$BASE_DIR/.env.example"
echo "DATABASE_NAME=motherboard" >> "$BASE_DIR/.env.example"

# Generate .env.development
cp "$BASE_DIR/.env.example" "$BASE_DIR/.env.development"

# Generate Dockerfile
cat > "$BASE_DIR/Dockerfile" << 'DEOF'
FROM golang:1.25-alpine AS builder
RUN apk add --no-cache curl
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o server .

FROM alpine:3.19
RUN apk add --no-cache ca-certificates curl
WORKDIR /app
COPY --from=builder /app/server .
CMD ["./server"]
DEOF

# Generate go.mod
cat > "$BASE_DIR/go.mod" << MODEOF
module github.com/Rupali59/Motherboard-$NAME

go 1.25.5
MODEOF

# Update go.work
if ! grep -q "./$BASE_DIR" go.work; then
    sed -i '' "/^)/i\\
    ./$BASE_DIR" go.work
fi

# Update ports.json
echo "Remember to add \"$BASE_DIR\": $PORT to ports.json"

echo "Scaffolded $TYPE '$NAME' at $BASE_DIR on port $PORT"
echo ""
echo "Next steps:"
echo "  1. Add \"$BASE_DIR\": $PORT to ports.json"
echo "  2. Add service to docker-compose.yml"
echo "  3. Run: cd $BASE_DIR && go mod tidy"
echo "  4. Update go.work if not auto-added"
```

---

## 3. Environment Variable Management

### 3.1 Current State

Each service manages env vars independently:

| Layer | Mechanism | Files |
|-------|-----------|-------|
| Docker Compose | `environment:` block + `env_file:` | `docker-compose.yml`, `docker-compose.local.yml` |
| Go services | `godotenv.Load()` + per-service `getEnv()` | Each service's `config.go` |
| Frontend | `process.env` + Next.js conventions | `.env.local`, `.env.development` |

**Problems:**
1. **Variable name inconsistency**: `MONGODB_URI` vs `CRM_MONGODB_URI` vs `MONGO_URI`; `DATABASE_NAME` vs `DB_NAME`
2. **No `.env.example` validation**: Services reference vars that may not exist in the template
3. **Localhost defaults in Docker**: All services default to `localhost:27017` which silently fails inside Docker (already documented as GAP-14 in `GRACEFUL_LIFECYCLE_STRATEGY.md`)
4. **Secrets in `.env` files**: No `.gitignore` validation that `.env.local` files aren't committed

### 3.2 Proposed Standard: Variable Naming Convention

| Variable | Standard Name | Previous Variants |
|----------|--------------|-------------------|
| MongoDB connection | `MONGODB_URI` | `CRM_MONGODB_URI`, `MONGO_URI` |
| Database name | `DATABASE_NAME` | `DB_NAME`, `CRM_DB_NAME` |
| Environment | `APP_ENV` | `ENV`, `ENVIRONMENT`, `NODE_ENV` |
| Port | `PORT` | `APP_PORT` |
| Log level | `LOG_LEVEL` | (consistent) |

### 3.3 Proposed Standard: `.env.example` Convention

Every service MUST have a `.env.example` with all variables documented:

```bash
# === Required ===
PORT=8095                                    # Service port
APP_ENV=development                          # development | staging | production
MONGODB_URI=mongodb://localhost:27017        # MongoDB connection string
DATABASE_NAME=motherboard                    # MongoDB database name

# === Optional ===
LOG_LEVEL=info                               # debug | info | warn | error
REDIS_URL=redis://localhost:6379             # Redis connection (if used)

# === Secrets (never commit actual values) ===
# JWT_SECRET=
# API_KEY=
```

### 3.4 Docker vs Local Environment Resolution

| Context | How PORT is Set | Priority |
|---------|----------------|----------|
| Docker Compose | `environment: - PORT=XXXX` in yaml | Highest (overrides .env) |
| Docker env_file | `env_file: - ./.env.local` | Medium |
| Local dev | `.env` loaded by `godotenv.Load()` | Lowest |
| Hardcoded default | `getEnv("PORT", "8090")` | Fallback only |

The `godotenv.Load()` call does NOT override existing environment variables. So in Docker, the `environment:` block takes precedence over anything in `env_file:`.

---

## 4. Chaukidar Consistency Analysis

### 4.1 Architecture Overview

```
┌──────────────────┐    Redis LPUSH     ┌──────────────────┐    Job Creation    ┌──────────────┐
│   Chaukidar       │ ─────────────────→ │   Scheduler       │ ─────────────────→ │  Job Workers  │
│  (File Watcher)   │                    │ (Event Listener)  │                    │  (5 workers)  │
│                   │                    │                   │                    │               │
│  Polls every 2s   │                    │  BRPop with 1s    │                    │  Poll every   │
│  radovskyb/watcher│                    │  timeout          │                    │  2s for jobs  │
└──────────────────┘                    └──────────────────┘                    └──────────────┘
  ↓ watches                               ↓ creates jobs                         ↓ executes
  WATCH_DIRECTORY                          SyncStyles (pri 3)                    Handler logic
  /monitored_root                          SyncEnv (pri 4)                       project.go
  (mounted volume)                         CommandExecute (pri 5)                GetOrCreate
```

### 4.2 How It Works

**Watcher** (`services/chaukidar/internal/watcher/watcher.go`):
- Uses `radovskyb/watcher` which is **polling-based** (not inotify/fsnotify) — reliable on macOS Docker mounts
- Polls `WATCH_DIRECTORY` every `POLL_INTERVAL` (default: 2 seconds)
- Filters: `Create`, `Write`, `Remove`, `Rename`, `Move` operations
- Ignores: `.git`, `node_modules`, `__pycache__`, `.idea`, `.vscode`, `dist`, `build`, `coverage`

**Publisher** (`services/chaukidar/internal/publisher/publisher.go`):
- Converts filesystem events to JSON `FileEvent` structs
- Extracts client name from the first directory level under watch root
- Pushes to Redis list `motherboard:events:file_changes` via `LPUSH`

**Listener** (`services/scheduler/internal/services/chaukidar/listener.go`):
- Runs in scheduler service, consumes events via `BRPop` (blocking pop from right — FIFO)
- Classifies events: style-related → `SyncStyles` job; env-related → `SyncEnv` job; `PROPOSED_COMMAND` → `CommandExecute` job
- Style detection: files containing `tailwind.config`, `.css`, or `theme`
- Env detection: files containing `.env`

**Project Service** (`services/scheduler/internal/services/chaukidar/project.go`):
- `GetOrCreateProject()` manages client project tracking in `chaukidar_projects` MongoDB collection
- Auto-assigns port by finding max existing port and incrementing
- Attempts to link to workspace by slug matching

### 4.3 Consistency Issues

#### ISSUE 1: New Top-Level Directories Not Watched at Runtime

**File**: `services/chaukidar/internal/watcher/watcher.go:61-93`

The `Start()` method does a one-time `ReadDir` + `AddRecursive` scan. If a new project directory is created under `WATCH_DIRECTORY` **after** the watcher starts, it will NOT be monitored.

```go
// watcher.go:66-93 — Only runs once at startup
files, err := os.ReadDir(mw.config.WatchDirectory)
// ...
for _, file := range files {
    if file.IsDir() {
        if err := mw.w.AddRecursive(fullPath); err != nil { ... }
    }
}
```

**Impact**: New client projects added to the monitored directory require a Chaukidar restart to be detected.

**Fix**: Add a periodic re-scan goroutine:
```go
// Add to Start() after the initial scan
go func() {
    ticker := time.NewTicker(30 * time.Second)
    defer ticker.Stop()
    for {
        select {
        case <-ticker.C:
            mw.rescanTopLevel()
        case <-mw.stopSignal:
            return
        }
    }
}()
```

#### ISSUE 2: Events Lost When Redis Is Down

**File**: `services/chaukidar/internal/publisher/publisher.go:80-82`

```go
if err := p.client.LPush(ctx, EventQueueKey, data).Err(); err != nil {
    log.Printf("Failed to push event to Redis: %v", err)
    return err
}
```

Events are logged but silently dropped. There is no:
- Retry with backoff
- Local buffer/WAL for replay
- Dead-letter mechanism

**Impact**: During Redis outages (even brief ones), file change events are permanently lost.

**Fix options** (in priority order):
1. **Retry with backoff**: Use `lifecycle.RetryWithBackoff` before dropping
2. **Local buffer**: Write failed events to a local file; replay on Redis reconnection
3. **Accept and document**: If Redis is critical infrastructure and restarts are fast, document that a Chaukidar restart should follow any Redis outage

#### ISSUE 3: Port Auto-Assignment Ignores Static Registry

**File**: `services/scheduler/internal/services/chaukidar/project.go:54`

`getNextAvailablePort()` queries only the `chaukidar_projects` MongoDB collection for the max port. It has no awareness of the static ports assigned in `ports.json` or `docker-compose.yml`.

**Scenario**: If `getNextAvailablePort()` returns 8090, it would collide with the billing service.

**Fix**: `getNextAvailablePort()` should:
1. Read the `clients_dynamic` band from `ports.json` (5000-5099)
2. Only assign ports within that band
3. Query MongoDB only for ports within that band

#### ISSUE 4: `Stop()` Double-Close Race

**File**: `services/chaukidar/internal/watcher/watcher.go:133-136`

```go
func (mw *Watcher) Stop() {
    close(mw.stopSignal)
    mw.w.Close()
}
```

The event loop goroutine (line 112) also calls `mw.w.Close()` when it receives from `stopSignal`. This can cause a double-close panic.

**Fix**: Remove `mw.w.Close()` from `Stop()` and let the goroutine handle it:
```go
func (mw *Watcher) Stop() {
    close(mw.stopSignal)
    // goroutine at line 112 will call mw.w.Close()
}
```

#### ISSUE 5: No Event Deduplication

The watcher can emit multiple events for the same file within a short window (e.g., editor save creates temporary file, writes, renames). Each event creates a separate job.

**Impact**: Redundant `SyncStyles` or `SyncEnv` jobs for the same client project.

**Fix**: Add a debounce buffer in the listener that coalesces events per (client, jobType) with a 5-second window before creating a job.

#### ISSUE 6: Listener File Type Classification Is Fragile

**File**: `services/scheduler/internal/services/chaukidar/listener.go:137-156`

```go
func (l *EventListener) isStyleRelated(event map[string]interface{}) bool {
    return strings.Contains(filePath, "tailwind.config") ||
        strings.HasSuffix(filePath, ".css") ||
        strings.Contains(filePath, "theme")
}
```

- `theme` matches any file with "theme" anywhere in the path (e.g., `prometheus/theme_park.go`)
- Doesn't handle `.scss`, `.less`, `postcss.config.*`, or CSS-in-JS files
- `isEnvRelated` matches any file with `.env` in the path, including `vendor/.env.test`

**Fix**: Use a configurable allowlist with proper glob matching, or move classification to the Chaukidar publisher so it sends structured event types.

### 4.4 Event Flow Reliability Summary

| Stage | Retry | Persistence | Failure Mode |
|-------|-------|-------------|-------------|
| Watcher → Publisher | None | None | Event dropped |
| Publisher → Redis | None | Redis list | Event dropped if Redis down |
| Redis → Listener | BRPop with 2s backoff | Redis list (pop removes) | Event consumed even if job creation fails |
| Listener → Job | None | MongoDB (job record) | Error logged, event lost |
| Job → Worker | 3 attempts (MaxAttempts) | MongoDB status tracking | Stuck in "running" if crash (GAP-4) |

---

## 5. Cross-Language Best Practices

### 5.1 Current State

| Aspect | Go Services | TypeScript Frontend |
|--------|------------|-------------------|
| Linting | `.golangci.yml` only in `apps/core-server` | No root ESLint/Biome config |
| Formatting | `gofmt` (not enforced) | No Prettier/Biome config |
| Pre-commit | None | None |
| CI/CD | None (`.github/` is empty) | None |
| Root Makefile | Does not exist | N/A |
| `.editorconfig` | Does not exist | Does not exist |

### 5.2 Proposed: Root `.editorconfig`

```ini
# .editorconfig
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.go]
indent_style = tab

[Makefile]
indent_style = tab

[*.md]
trim_trailing_whitespace = false
```

### 5.3 Proposed: Root `.golangci.yml`

Move the existing `apps/core-server/.golangci.yml` to the repository root. This makes it the default for all Go modules when running `golangci-lint` from any service directory (golangci-lint walks up to find config).

Key linters enabled (from the existing config):
- `errcheck`, `govet`, `staticcheck` — correctness
- `gosec` — security
- `gofmt`, `goimports` — formatting
- `goconst`, `gocyclo` — complexity
- `lll` (140 chars), `misspell` — style

Change the `goimports.local-prefixes` to cover all modules:
```yaml
goimports:
  local-prefixes: github.com/Rupali59
```

### 5.4 Proposed: Root Makefile

```makefile
.PHONY: lint lint-go lint-ts test scaffold validate-ports docker-up docker-down

# Lint all Go modules in the workspace
lint-go:
	golangci-lint run ./...

# Lint TypeScript frontend
lint-ts:
	cd apps/admin-dashboard && npx next lint

# Lint everything
lint: lint-go lint-ts

# Run all Go tests
test:
	go test ./...

# Scaffold a new service
scaffold:
	@bash tools/scaffold-service.sh $(TYPE) $(NAME) $(PORT)

# Validate port assignments
validate-ports:
	@python3 tools/validate_ports.py

# Docker
docker-up:
	docker compose -f docker-compose.yml -f docker-compose.local.yml up -d

docker-down:
	docker compose -f docker-compose.yml -f docker-compose.local.yml down
```

### 5.5 Proposed: Dockerfile Convention

All Go service Dockerfiles MUST:

1. **Use multi-stage build** with `golang:1.25-alpine` as builder
2. **Include `curl` or `wget`** in the final image for health checks (docker-compose healthcheck uses these)
3. **NOT use `lsof`** or other tools not available in Alpine (see GAP-12 from `GRACEFUL_LIFECYCLE_STRATEGY.md`)
4. **Set `CGO_ENABLED=0`** for static linking
5. **Expose the service port** via `EXPOSE`
6. **Include `ca-certificates`** for TLS

Template:
```dockerfile
FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o server .

FROM alpine:3.19
RUN apk add --no-cache ca-certificates curl
WORKDIR /app
COPY --from=builder /app/server .
EXPOSE ${PORT}
CMD ["./server"]
```

### 5.6 Proposed: Pre-Commit Hooks

Create `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.6.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-json
      - id: check-merge-conflict
      - id: detect-private-key

  - repo: https://github.com/golangci/golangci-lint
    rev: v2.1.0
    hooks:
      - id: golangci-lint
        args: ["--config=.golangci.yml"]

  - repo: local
    hooks:
      - id: validate-ports
        name: Validate port assignments
        entry: python3 tools/validate_ports.py
        language: python
        files: '(ports\.json|docker-compose.*\.yml|\.env)'
        pass_filenames: false

      - id: no-env-secrets
        name: Check .env files not committed
        entry: bash -c 'git diff --cached --name-only | grep -E "\.env\.local$" && echo "ERROR: .env.local files should not be committed" && exit 1 || exit 0'
        language: system
        pass_filenames: false
```

---

## 6. Adding a New Component: Complete Checklist

### 6.1 Adding a New Go Service

```
Step  Action                                    Files Affected
────  ──────────────────────────────────────────  ──────────────────────────────
 1    Claim a port from the 8081-8099 range      ports.json
 2    Run scaffold script                         tools/scaffold-service.sh
      (or create manually following §2.4)
 3    Update go.work                              go.work
 4    Add to docker-compose.yml                   docker-compose.yml
      - Set PORT, APP_ENV, MONGODB_URI
      - Add env_file reference
      - Add healthcheck
      - Add depends_on: mongodb
      - Set stop_grace_period: 30s
 5    Add port mapping to local overlay           docker-compose.local.yml
 6    Update tools/update_ports.py                tools/update_ports.py
 7    If proxied through core-server:
      Add SERVICE_URL env to backend service      docker-compose.yml (backend env)
      Add proxy route in router                   apps/core-server/internal/router/
 8    Run `go mod tidy`                           services/<name>/go.mod
 9    Build and verify:
      docker compose build <name>
      docker compose up <name>
      curl http://localhost:<port>/healthz
```

### 6.2 Adding a New Plugin

Same as service, but:
- Directory under `plugins/<name>/` instead of `services/<name>/`
- Register in core-server's plugin proxy middleware if it needs to be accessible via the core API
- Add to `plugins/capabilities.json` if it has capability-gated features

### 6.3 Adding a New Client Project

Client projects are detected automatically by Chaukidar when placed under `WATCH_DIRECTORY`. However:

1. **Static clients** (manually configured): Add to `docker-compose.clients.dev.yml` with ports from the 3100-3199 range
2. **Dynamic clients** (Chaukidar-provisioned): Place in the watched directory; Chaukidar assigns a port from 5000+
3. In both cases, update `ports.json` and run `make sync-ports` (and optionally `make update-ports`)

### 6.4 Adding a Non-Go Service

For Python, Node.js, or other language services:

1. Follow the same port/env/Docker conventions above
2. **Must expose** `/health` endpoint returning `200 OK` (for docker-compose healthcheck)
3. Must read `PORT` from environment
4. Must use the same `.env.example` convention
5. Add language-specific linting to the root Makefile:
   ```makefile
   lint-python:
       cd services/<name> && ruff check .
   ```

---

## Appendix A: Port Validation Script

Create `tools/validate_ports.py`:

```python
#!/usr/bin/env python3
"""Validate that all port assignments are consistent across ports.json,
docker-compose files, and service configs."""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent

def load_port_registry():
    with open(ROOT / "ports.json") as f:
        return json.load(f)

def find_compose_ports():
    """Extract PORT= assignments from docker-compose*.yml"""
    ports = {}
    for yml in ROOT.glob("docker-compose*.yml"):
        content = yml.read_text()
        for match in re.finditer(r'PORT=(\d+)', content):
            port = int(match.group(1))
            ports.setdefault(port, []).append(str(yml.name))
    return ports

def find_config_defaults():
    """Extract default port values from Go config files"""
    ports = {}
    for config_file in ROOT.rglob("config.go"):
        if "vendor" in str(config_file) or "node_modules" in str(config_file):
            continue
        content = config_file.read_text()
        for match in re.finditer(r'getEnv\("PORT",\s*"(\d+)"', content):
            port = int(match.group(1))
            rel = config_file.relative_to(ROOT)
            ports.setdefault(port, []).append(str(rel))
    return ports

def check_collisions(registry):
    """Check for duplicate port assignments"""
    seen = {}
    errors = []
    for path, port in registry.get("assignments", {}).items():
        if port in seen:
            errors.append(f"COLLISION: Port {port} assigned to both '{seen[port]}' and '{path}'")
        seen[port] = path
    return errors

def main():
    registry = load_port_registry()
    errors = check_collisions(registry)

    compose_ports = find_compose_ports()
    config_ports = find_config_defaults()

    # Check that registered ports appear in docker-compose
    for path, port in registry.get("assignments", {}).items():
        if port not in compose_ports:
            errors.append(f"WARNING: Port {port} ({path}) not found in any docker-compose file")

    if errors:
        for e in errors:
            print(e, file=sys.stderr)
        sys.exit(1)
    else:
        print(f"All {len(registry.get('assignments', {}))} port assignments validated successfully.")

if __name__ == "__main__":
    main()
```

---

## Appendix B: Services Currently NOT Using `lifecycle.New()`

These services use manual `http.Server` and should be migrated to `lifecycle.New()` for consistent graceful shutdown, drain periods, and probe endpoints:

| Service | Current Pattern | File |
|---------|----------------|------|
| `apps/core-server` | Manual `http.Server` + signal handler | `apps/core-server/main.go:194-208` |
| `services/billing` | Manual `http.Server` + `killProcessOnPort` | `services/billing/cmd/server/main.go` |
| `services/notification` | Manual `http.Server` + WaitGroup | `services/notification/cmd/server/main.go:118-129` |
| `services/storage` | Manual `http.Server` + `gin.Default()` | `services/storage/cmd/server/main.go:73-78` |
| `services/scheduler` | No HTTP server (worker-only) | `services/scheduler/cmd/server/main.go` |
| `services/health` | Manual `http.Server` | `services/health/cmd/server/main.go` |
| `services/entitlement` | Manual `http.Server` | `services/entitlement/main.go` |

Services already using `lifecycle.New()`:
- `services/auth` — `services/auth/cmd/server/main.go`
- `services/cloud-adapter` — `services/cloud-adapter/main.go`
- `services/marketing` — `services/marketing/main.go`
