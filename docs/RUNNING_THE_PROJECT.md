# Running Motherboard Efficiently

A practical operational guide for running the Motherboard platform — written in context of the upcoming inventory management extensibility, ads/content management system, and Google/Meta analytics integrations (see `docs/market_analyser.md` for the full product vision).

---

## Table of Contents

1. [Current State of the Platform](#current-state-of-the-platform)
2. [Prerequisites](#prerequisites)
3. [Environment Setup](#environment-setup)
4. [Running the Platform](#running-the-platform)
5. [Service Architecture & Communication](#service-architecture--communication)
6. [Development Workflows](#development-workflows)
7. [Working with the Inventory Plugin](#working-with-the-inventory-plugin)
8. [Working with the Orders Plugin](#working-with-the-orders-plugin)
9. [Marketing Service — Current State & Roadmap](#marketing-service--current-state--roadmap)
10. [Notification Pipeline](#notification-pipeline)
11. [Entitlements & Multi-Tenancy](#entitlements--multi-tenancy)
12. [Billing Integration](#billing-integration)
13. [Integration Plan: Extensible Inventory System](#integration-plan-extensible-inventory-system)
14. [Integration Plan: Ads & Content Management with Google/Meta Analytics](#integration-plan-ads--content-management-with-googlemeta-analytics)
15. [Docker Compose Topology](#docker-compose-topology)
16. [Debugging & Troubleshooting](#debugging--troubleshooting)
17. [Port Reference](#port-reference)

---

## Current State of the Platform

| Component | Status | Notes |
|-----------|--------|-------|
| Core backend (Go/Gin) | Stable | Multi-tenant, plugin proxy, RBAC |
| Core frontend (Next.js 15) | Stable | React 18, TanStack Query, Radix UI |
| Inventory plugin | Working (MVP) | Basic CRUD + stock ops, single collection |
| Orders plugin | Working (MVP) | Syncs with inventory for stock reservation |
| Notification service | POC | 4-stage pipeline, channel dispatch working |
| Billing service | Functional | Stripe/Razorpay/PayPal, subscriptions + invoicing |
| Entitlement service | Functional | Casbin RBAC, workspace-scoped policies |
| Marketing service | **Stub only** | Has adapter skeletons for Google Ads & Meta Ads |
| Cloud adapter | Stub | AWS/GCP provider interfaces defined |

This means the inventory, orders, and core platform are ready for extension, the marketing/ads layer needs to be built, and the notification pipeline is ready to wire into new event sources.

---

## Prerequisites

### Required
- **Docker** & **Docker Compose** v2+
- **Go 1.25.5** (matches `go.work`)
- **Node.js 22.x** (matches `apps/admin-dashboard/package.json` engine requirement)
- **npm** (ships with Node)

### Recommended
- **Air** — Go hot-reload (`go install github.com/air-verse/air@latest`)
- **golangci-lint** — Go linting (`go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest`)
- **swag** — Swagger doc generation (`go install github.com/swaggo/swag/cmd/swag@latest`)

Or install all three at once:
```bash
cd apps/core-server && make install-tools
```

---

## Environment Setup

### 1. Create environment files

```bash
# Root-level env for Docker Compose
cp .env.example .env

# Backend-specific env
cp apps/core-server/.env.example apps/core-server/.env
```

### 2. Validate backend env

```bash
cd apps/core-server && make check-env
```

This checks for `CRM_MONGODB_URI`, `CRM_DB_NAME`, `API_KEY`, `JWT_SECRET`, and `PORT`.

### 3. Critical environment variables

**Core platform:**
```env
# Database
MONGO_URI=mongodb://localhost:27017/motherboard
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=<at-least-32-characters>
ENCRYPTION_KEY=<at-least-32-characters>

# Feature flags
ENABLE_BILLING=false       # Toggle billing service
ENABLE_WEBAUTHN=true       # Passwordless auth
ENABLE_OAUTH=true          # OAuth2 flows
```

**Inter-service URLs** (Docker Compose sets these automatically, needed for manual runs):
```env
AUTH_SERVICE_URL=http://localhost:8088
BILLING_SERVICE_URL=http://localhost:8090
ENTITLEMENT_SERVICE_URL=http://localhost:8085
NOTIFICATION_SERVICE_URL=http://localhost:8094
STORAGE_SERVICE_URL=http://localhost:8095
```

**Inventory & Orders** (each plugin has its own `.env`):
```env
# Inventory plugin
MONGODB_URI=mongodb://localhost:27017
DATABASE_NAME=motherboard-inventory
PORT=8096

# Orders plugin
MONGODB_URI=mongodb://localhost:27017
DATABASE_NAME=motherboard-orders
PORT=8097
INVENTORY_SERVICE_URL=http://localhost:8096
```

**For future ads/analytics integrations** (you will need these):
```env
# Google Ads
GOOGLE_ADS_CLIENT_ID=<oauth-client-id>
GOOGLE_ADS_CLIENT_SECRET=<oauth-client-secret>
GOOGLE_ADS_DEVELOPER_TOKEN=<developer-token>
GOOGLE_ADS_REFRESH_TOKEN=<refresh-token>

# Meta/Facebook Ads
META_APP_ID=<app-id>
META_APP_SECRET=<app-secret>
META_ACCESS_TOKEN=<long-lived-access-token>
```

---

## Running the Platform

### Option A: Full platform via Docker (recommended)

```bash
# Start infrastructure + all services
docker compose -f docker-compose.dev.yml up

# With client instances
docker compose -f docker-compose.dev.yml -f docker-compose.clients.dev.yml up

# Background mode
docker compose -f docker-compose.dev.yml up -d
```

### Option B: Scripted deployment

```bash
./deploy.sh local up       # Start with health checks and validation
./deploy.sh local logs     # Aggregate logs
./deploy.sh local down     # Graceful shutdown
./deploy.sh local health   # Check all service health endpoints
./deploy.sh local status   # Container status
```

### Option C: Manual — run services individually

This is useful when you're actively developing a specific service.

**Terminal 1 — Infrastructure:**
```bash
docker compose -f docker-compose.dev.yml up redis mongodb minio
```

**Terminal 2 — Backend:**
```bash
cd apps/core-server
make dev    # Hot-reload on port 4021
```

**Terminal 3 — Frontend:**
```bash
cd apps/admin-dashboard
npm install
npm run dev    # Turbo dev server on port 4020
```

**Terminal 4 — Whichever service you're working on:**
```bash
cd plugins/inventory
go run main.go    # Port 8096

cd services/marketing
go run main.go    # Port 8092 (once built out)
```

### Option D: Minimal (lite) setup

```bash
docker compose -f docker-compose.lite.yml up
```

Runs only core infrastructure and the main backend/frontend — useful for frontend-focused work.

---

## Service Architecture & Communication

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                │
│                     Port 4020                       │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP
┌──────────────────────▼──────────────────────────────┐
│              Core Backend (Go/Gin)                   │
│               Port 4021 / 8080                       │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  Middleware Pipeline:                         │   │
│  │  CORS → Auth → Workspace → Entitlement →     │   │
│  │  RBAC → Audit → Plugin Proxy                  │   │
│  └──────────────────────────────────────────────┘   │
└──┬────────┬─────────┬─────────┬─────────┬───────────┘
   │        │         │         │         │
   ▼        ▼         ▼         ▼         ▼
Plugins  Services  Billing  Entitle-  Notifi-
(email,  (auth,    :8090    ment      cation
 sms,    sched,             :8085     :8094
 etc.)   health)
```

**Key communication patterns:**

1. **Plugin Proxy** — The core backend proxies frontend requests to plugins via `PluginProxyMiddleware`. Requests are enriched with `X-Workspace-ID` headers and scoped JWT tokens.

2. **Direct HTTP clients** — Services call each other via HTTP. For example, the orders plugin calls the inventory plugin's `/api/items/:id/reserve` endpoint to reserve stock before creating an order.

3. **Redis Streams** — The notification service consumes events from the `events.motherboard` Redis stream for async event processing.

4. **Environment-based discovery** — No service mesh. Services find each other via environment variables (`INVENTORY_SERVICE_URL`, `BILLING_SERVICE_URL`, etc.).

---

## Development Workflows

### Backend development cycle

```bash
cd apps/core-server

# Start with hot-reload (auto-restarts on file changes)
make dev

# Run tests
make test

# Lint before committing
make lint

# Format code
make fmt

# Regenerate Swagger docs after changing API annotations
make swagger
# Then check at http://localhost:4021/swagger/index.html
```

### Frontend development cycle

```bash
cd apps/admin-dashboard

npm run dev           # Dev server with Turbo

npm run check         # Lint + typecheck (run before committing)
npm test              # Vitest unit tests
npm run test:e2e      # Playwright E2E (needs running backend)
npm run format        # Prettier
```

### Plugin/service development cycle

Each plugin/service is a standalone Go module. Development is the same pattern:

```bash
cd plugins/inventory   # or any service dir

go run main.go                  # Run directly
go test -v ./...                # Test
go fmt ./...                    # Format
```

### Pre-commit hooks

```bash
cd apps/core-server
make install-pre-commit    # One-time setup
make pre-commit            # Run on staged files
make pre-commit-all        # Run on everything
```

---

## Working with the Inventory Plugin

**Location:** `plugins/inventory/`
**Port:** 8096
**Database:** `motherboard-inventory` (MongoDB)
**Collection:** `items`

### Data model

```go
type Item struct {
    ID          primitive.ObjectID
    Name        string     // required
    SKU         string     // required, unique
    Description string
    Price       float64    // required
    Quantity    int        // min=0
    CreatedAt   time.Time
    UpdatedAt   time.Time
}
```

### API endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/items` | List all items |
| GET | `/api/items/:id` | Get single item |
| POST | `/api/items` | Create item |
| PUT | `/api/items/:id/stock` | Update stock (`{"quantity": 5, "type": "add" or "remove"}`) |
| POST | `/api/items/:id/reserve` | Reserve stock (alias for stock removal) |
| GET | `/health` | Health check |

### Current limitations (relevant to extensibility plan)

- No multi-tenant scoping — all items in a single collection
- No workspace isolation
- No entitlement checks
- No custom attributes / metadata fields
- No category/tag system
- No audit trail
- No pagination on list endpoint
- No webhook/event emission on stock changes

---

## Working with the Orders Plugin

**Location:** `plugins/orders/`
**Port:** 8097
**Database:** `motherboard-orders`
**Depends on:** Inventory plugin (for stock reservation)

### Order creation flow

```
POST /api/orders {"item_id": "...", "quantity": 2}
  → Validate payload
  → HTTP POST to inventory:8096/api/items/{itemID}/reserve
  → If 200: create order (status: "created")
  → If 409: return "out of stock" error
  → If error: return "inventory service unavailable"
```

### Current limitations

- No rollback if order DB insert fails after stock reservation
- No status transitions (no "completed" or "shipped" workflow)
- No multi-tenant scoping
- No payment integration
- 10-second timeout on inventory calls (no retry/circuit-breaker)

---

## Marketing Service — Current State & Roadmap

**Location:** `services/marketing/`
**Port:** 8092
**Status:** Stub with adapter interfaces

### What exists today

```
services/marketing/
├── main.go
├── internal/
│   ├── integrations/
│   │   ├── google_ads/
│   │   │   └── adapter.go     # Interface + mock data
│   │   └── meta_ads/
│   │       └── adapter.go     # Interface + mock data
│   └── models/
│       └── metrics.go         # MarketingMetrics struct
```

The `MarketingMetrics` model:
```go
type MarketingMetrics struct {
    Platform     string    // "google_ads" or "meta_ads"
    CampaignID   string
    CampaignName string
    Impressions  int64
    Clicks       int64
    Spend        float64
    Currency     string
    Conversions  int64
    Date         time.Time
}
```

The adapters return mock campaign metrics. No OAuth flows, no API clients, no data persistence.

### What needs to be built (aligned with market_analyser.md)

This is detailed in [Integration Plan: Ads & Content Management](#integration-plan-ads--content-management-with-googlemeta-analytics) below.

---

## Notification Pipeline

**Location:** `services/notification/`
**Port:** 8094

The notification service implements a 4-stage pipeline that will be central to both inventory alerts and campaign event processing:

```
Ingestor → Templater → Dispatcher → CallbackHandler
```

1. **Ingestor** — Receives events, assigns IDs, validates payloads
2. **Templater** — Enriches notifications with user data from the auth service
3. **Dispatcher** — Routes to the correct channel plugin (email/sms/whatsapp/telegram) after checking entitlements
4. **CallbackHandler** — Processes delivery status callbacks

### Relevant for new integrations

- **Inventory events** (low stock, restock, reservation failure) should publish to this pipeline
- **Campaign events** (budget exhausted, performance anomaly, ad disapproved) should publish here too
- Events flow through Redis Streams on `events.motherboard`

---

## Entitlements & Multi-Tenancy

### Multi-tenant database architecture

The core server's `TenantManager` supports two isolation modes:

1. **Shared database** (default) — All tenants in one MongoDB instance, workspace ID scoping on queries
2. **Custom database** — Tenants can bring their own MongoDB URI, stored per-workspace

```go
db, err := database.GetTenantManager(cfg).GetDatabase(ctx, tenantID)
// Returns tenant-specific or global database
```

Connection pooling: max 10 connections per tenant, 2 minimum, 30-minute idle TTL.

### Entitlement enforcement

The entitlement service (port 8085) uses Casbin RBAC with workspace-scoped policies:

```go
// Middleware usage in core server
r.GET("/api/emails",
    middleware.EntitlementMiddleware("email-feature"),
    handler.GetEmails)

// Check from any service
POST http://entitlement:8085/api/v1/check
{"workspace_id": "ws-123", "user_id": "u-456", "resource": "inventory", "action": "write"}
// Response: {"allowed": true}
```

Plugins are gated by `entitlement_key` defined in `plugins/capabilities.json`:
```json
{"id": "inventory", "entitlement_key": "inventory", "category": "business"}
{"id": "orders", "entitlement_key": "orders", "category": "business"}
```

---

## Billing Integration

**Port:** 8090 | **Database:** `billing`

Supports subscriptions (monthly/quarterly/annual), invoicing with line items, usage-based metering, and three payment providers (Stripe, Razorpay, PayPal).

Relevant for the new integrations:
- Inventory and ads features should be gated behind subscription tiers
- Usage-based billing (e.g., number of ad accounts connected, API calls to Google/Meta) is already supported via the `UsageRecord` model
- Webhook endpoints exist for all three payment providers

---

## Integration Plan: Extensible Inventory System

The current inventory plugin is a basic CRUD service. To make it extensible and client-customizable, here is what needs to happen, in build order:

### Phase 1: Multi-tenancy & Core Model Expansion

1. **Add workspace scoping** to all inventory operations
   - Add `WorkspaceID` field to the `Item` model
   - Route all queries through the core server's `TenantManager` or add workspace filtering
   - Use `X-Workspace-Slug` header (already flowing through core middleware)

2. **Extensible item schema**
   - Add a `CustomFields map[string]interface{}` to the Item model
   - Allow workspaces to define custom field schemas (stored per-workspace)
   - Validate custom fields against the workspace's schema on create/update

3. **Categories & tags**
   - Add `Category string` and `Tags []string` to the Item model
   - Support hierarchical categories (parent-child)
   - Filterable on list endpoints

4. **Pagination, sorting, filtering**
   - Add `page`, `limit`, `sort`, `filter` query params to `GET /api/items`
   - MongoDB cursor-based pagination for large inventories

### Phase 2: Stock Management & Events

5. **Stock movement ledger**
   - Create a `StockMovement` collection tracking every add/remove/reserve/release
   - Each movement records: item ID, workspace ID, quantity, type, reference (order ID, manual adjustment), timestamp, user ID
   - Current quantity derived from ledger or maintained as a materialized field

6. **Event emission**
   - Publish events to Redis Streams on stock changes:
     - `inventory.stock.low` — quantity below configurable threshold
     - `inventory.stock.updated` — any stock change
     - `inventory.item.created` / `inventory.item.updated`
   - Wire into the notification service pipeline

7. **Entitlement gating**
   - Register inventory as a gated feature via entitlement service
   - Support tiered limits (e.g., free tier = 100 items, pro = unlimited)

### Phase 3: Client Customization

8. **Per-workspace configuration**
   - Low stock threshold (configurable per workspace)
   - Required custom fields
   - Default category tree
   - Currency and unit preferences

9. **Bulk operations**
   - CSV/JSON import/export
   - Bulk stock adjustment
   - Bulk price update

10. **Audit trail**
    - Log all mutations with user ID, timestamp, before/after values
    - Queryable via API for compliance

### Phase 4: Advanced Features

11. **Variant support** — Items with size/color/material variants sharing a parent SKU
12. **Supplier management** — Link items to suppliers, track reorder points
13. **Warehouse/location support** — Stock per location, transfer between locations
14. **Integration with orders** — Full order lifecycle (created → confirmed → shipped → delivered → returned)
15. **Webhooks** — Allow clients to register webhook URLs for inventory events

---

## Integration Plan: Ads & Content Management with Google/Meta Analytics

This is the implementation roadmap for the system described in `docs/market_analyser.md`, starting with Google and Meta as the first two platforms.

### Phase 1: Data Ingestion Layer

**Build the OAuth connection flow:**

1. **Google Ads OAuth2**
   - Implement OAuth2 authorization code flow in `services/marketing/internal/integrations/google_ads/`
   - Store refresh tokens per workspace in MongoDB (encrypted with `ENCRYPTION_KEY`)
   - Use the Google Ads API v17+ (`google.golang.org/api` or the `google-ads-go` client)

2. **Meta Marketing API OAuth**
   - Implement Facebook Login flow for business accounts
   - Store long-lived access tokens per workspace
   - Use Meta Marketing API v21+ for campaign and ad account data

3. **Token refresh & rate limit management**
   - Background goroutine to refresh tokens before expiry
   - Redis-backed rate limiter per platform per workspace
   - Exponential backoff on API errors

**Build the sync scheduler:**

4. **Campaign data sync** — New background jobs in `services/scheduler/`
   - Periodic sync (configurable: every 15min, 1hr, 6hr, daily)
   - Pull campaigns, ad sets/groups, ads, and performance metrics
   - Store raw data in a `marketing_raw` collection per workspace
   - Normalize into the unified `MarketingMetrics` schema

5. **Sync status tracking**
   - Record last sync time, status (success/failed/partial), error details per workspace per platform
   - Expose via API for dashboard display

### Phase 2: Unified Analytics Layer

6. **Normalized data schema** (expand the current `MarketingMetrics`):

```go
type CampaignMetrics struct {
    WorkspaceID   string
    Platform      string     // "google_ads", "meta_ads"
    AccountID     string     // Platform ad account ID
    CampaignID    string
    CampaignName  string
    AdSetID       string     // Ad group (Google) / Ad set (Meta)
    AdSetName     string
    AdID          string
    AdName        string
    Objective     string     // awareness, consideration, conversion
    Status        string     // active, paused, removed

    // Performance metrics
    Impressions   int64
    Clicks        int64
    Spend         float64
    Currency      string
    Conversions   int64
    ConversionValue float64
    CTR           float64    // Computed: clicks / impressions
    CPC           float64    // Computed: spend / clicks
    CPM           float64    // Computed: (spend / impressions) * 1000
    ROAS          float64    // Computed: conversion_value / spend

    // Time dimensions
    Date          time.Time
    DateGranularity string  // "daily", "weekly", "monthly"

    // Attribution
    AttributionWindow string // "7d_click", "1d_view", etc.

    Metadata      map[string]interface{}
}
```

7. **Cross-platform dashboard API endpoints** in `services/marketing/`:
   - `GET /api/v1/campaigns` — Unified campaign list across platforms
   - `GET /api/v1/campaigns/:id/metrics` — Time-series performance data
   - `GET /api/v1/analytics/summary` — Blended ROAS, total spend, total conversions
   - `GET /api/v1/analytics/by-platform` — Per-platform breakdown
   - `GET /api/v1/analytics/trends` — Period-over-period comparison

8. **Budget tracking**
   - `GET /api/v1/budgets` — Budget allocation and pacing per campaign
   - Pacing alerts when spend exceeds projected rate (wire into notification service)

### Phase 3: Content Management

9. **UTM management**
   - Auto-generate UTMs based on campaign taxonomy
   - Validate UTM consistency across campaigns
   - Store UTM templates per workspace

10. **Creative asset library**
    - Extend the existing storage service (port 8095) to handle ad creatives
    - Link assets to campaigns and ad sets
    - Track which creative variants are active

11. **Content calendar**
    - Planned vs. live campaign timeline
    - Integration with organic content scheduling
    - Status workflow: draft → approved → scheduled → live → completed

### Phase 4: Intelligence Layer

12. **Anomaly detection**
    - Background job comparing current metrics to rolling averages
    - Detect: CPC spikes, CTR drops, spend anomalies, quality score changes
    - Publish events to notification pipeline:
      - `campaign.anomaly.cpc_spike`
      - `campaign.anomaly.ctr_drop`
      - `campaign.budget.pacing_alert`
      - `campaign.ad.disapproved`

13. **Competitor signals** (via SEMrush/SpyFu API integration)
    - Share of voice tracking
    - Keyword gap analysis
    - Competitor ad copy monitoring

14. **Recommendations engine**
    - Budget reallocation suggestions based on ROAS
    - Bid strategy recommendations based on conversion volume
    - Keyword overlap detection (paid vs. organic cannibalization)

### Phase 5: Client Customization

15. **Per-workspace configuration**
    - Connected ad accounts (multi-account support)
    - Attribution model preference (first-touch, last-touch, linear, data-driven)
    - Dashboard layout customization
    - Alert thresholds (configurable per workspace)
    - Currency and timezone

16. **Access control**
    - Agency view: all clients, all accounts
    - Client view: own data only, optionally with agency margins hidden
    - Read-only share links for stakeholders
    - Extend entitlement service with marketing-specific roles

17. **White-label reporting**
    - PDF/CSV export via the existing export infrastructure
    - Scheduled report delivery via notification service

---

## Docker Compose Topology

### Service dependency graph (dev environment)

```
Infrastructure:
  redis (6379) ─────────────────────┐
  mongodb (27017) ──────────────────┤
  minio (9000/9001) ────────────────┤
                                    │
Core:                               │
  backend (8080) ───────────────────┤ depends on: redis, mongodb
  frontend (3000) ──────────────────┤ depends on: backend
                                    │
Microservices:                      │
  entitlement (8085) ───────────────┤ depends on: mongodb
  billing (8090) ───────────────────┤ depends on: mongodb, redis
  notification (8094) ──────────────┤ depends on: mongodb, redis
  scheduler (8089) ─────────────────┤ depends on: mongodb, redis
  health (8091) ────────────────────┤ depends on: redis
  storage (8098) ───────────────────┤ depends on: mongodb, minio
  marketing (8092) ─────────────────┤ depends on: mongodb, redis
  task-tracker (8096) ──────────────┤ depends on: mongodb
  cloud-adapter (8093) ─────────────┘

Plugins:
  email (8081) ─────── standalone
  sms (8082) ──────── standalone
  whatsapp (8083) ──── standalone
  telegram (8084) ──── standalone
  razorpay (8086) ──── standalone
  stripe (8087) ────── standalone

Business Plugins:
  inventory (8096) ──── depends on: mongodb
  orders (8097) ─────── depends on: mongodb, inventory
```

All services share the `motherboard-network` Docker bridge network.

---

## Debugging & Troubleshooting

### Viewing logs

```bash
# All services
./deploy.sh local logs

# Specific service
./deploy.sh local logs billing
docker compose -f docker-compose.dev.yml logs -f marketing

# Backend only
cd apps/core-server && make dev   # Logs to stdout
```

### Port conflicts

```bash
# Kill whatever's on port 4021
cd apps/core-server && make kill-port

# Kill a specific port
PORT=8096 make kill-port
```

### Database inspection

```bash
# Connect to MongoDB
docker exec -it motherboard-mongodb mongosh

# Switch to a service database
use motherboard-inventory
db.items.find().pretty()

use motherboard-orders
db.orders.find().pretty()

use billing
db.subscriptions.find().pretty()
```

### Health checks

The backend (core-server) exposes the three-probe model: **liveness** (`/healthz`), **readiness** (`/readyz`), and **startup** (`/startupz`). The existing `/health` endpoint is an alias for `/readyz`. See `docs/GRACEFUL_LIFECYCLE_STRATEGY.md` for the full strategy.

```bash
# Platform-wide
./deploy.sh local health

# Individual services (backend supports readyz; others use /health)
curl http://localhost:4021/readyz     # Backend readiness
curl http://localhost:4021/healthz    # Backend liveness
curl http://localhost:4021/health     # Backend (same as readyz)
curl http://localhost:8096/health      # Inventory
curl http://localhost:8094/health      # Notification
curl http://localhost:8085/health      # Entitlement
curl http://localhost:8090/health      # Billing
```

### Common issues

| Problem | Cause | Fix |
|---------|-------|-----|
| Backend won't start | Port 4021 in use | `make kill-port` |
| MongoDB connection refused | Docker not running | `docker compose -f docker-compose.dev.yml up mongodb` |
| Orders fail with 409 | Inventory has 0 stock | `PUT /api/items/:id/stock {"quantity": 10, "type": "add"}` |
| Swagger 404 | Docs not generated | `make swagger` |
| Frontend `ECONNREFUSED` | Backend not running | Start backend first |
| Entitlement check fails | No policies loaded | Create policies via `POST /api/v1/check` |

---

## Port Reference

| Service | Port | Protocol |
|---------|------|----------|
| Frontend (dev) | 4020 | HTTP |
| Backend (local) | 4021 | HTTP |
| Backend (Docker) | 8080 | HTTP |
| Email plugin | 8081 | HTTP |
| SMS plugin | 8082 | HTTP |
| WhatsApp plugin | 8083 | HTTP |
| Telegram plugin | 8084 | HTTP |
| Entitlement service | 8085 | HTTP |
| Razorpay plugin | 8086 | HTTP |
| Stripe plugin | 8087 | HTTP |
| Auth service | 8088 | HTTP |
| Scheduler | 8089 | HTTP |
| Billing service | 8090 | HTTP |
| Health service | 8091 | HTTP |
| Marketing service | 8092 | HTTP |
| Cloud adapter | 8093 | HTTP |
| Notification service | 8094 | HTTP |
| Storage service | 8095 | HTTP |
| Inventory plugin / Task tracker | 8096 | HTTP |
| Orders plugin | 8097 | HTTP |
| MongoDB | 27017 | TCP |
| Redis | 6379 | TCP |
| MinIO API | 9000 | HTTP |
| MinIO Console | 9001 | HTTP |
