# Local MongoDB Data Setup — Analysis

This document outlines what MongoDB data and auth configuration each service needs for local development. Each service that calls another service or persists data needs proper identification/authentication.

---

## 1. MongoDB Databases

| Database | Used By | Purpose |
|----------|---------|---------|
| **motherboard** | Backend API, Entitlement, Health, Notification, Storage, Scheduler | Workspaces, plugins, entitlements, clients, health checks, assets, jobs |
| **auth** | Auth Service | Users, sessions, OTP, roles, RBAC assignments, OAuth clients |
| **billing** | Billing Service | Subscriptions, usage records |
| **casbin** (or motherboard) | Entitlement (Casbin policy engine) | RBAC policy rules (casbin_rule collection) |

---

## 2. Collections by Database

### Database: `motherboard`

| Collection | Source | Description |
|------------|--------|-------------|
| `workspaces` | init_platform.js, backend | Tenant roots; must have Motherboard workspace |
| `plugins` | init_platform.js, entitlement | Plugin registry (crm, staff-management, integrations) |
| `workspace_plugins` | seed_entitlements.js, entitlement | Which plugins are enabled per workspace |
| `entitlements` | init_platform.js | Feature entitlements per workspace (feature_crm, feature_staff, feature_integrations) |
| `users` | Backend (legacy) | Deprecated; auth service owns user data |
| `clients` | Backend | Client records (workspace-scoped) |
| `websites` | Backend | Website records |
| `integrations` | Backend | GitHub, Vercel, etc. |
| `configurations` | Backend | Workspace configs |
| `jobs` | Scheduler | Background job records |
| `health_checks` | Health | Per-service health check history |
| `services` | Health | Service registry (name, type, expected interval) |
| `health_assets` | Backend | Health dashboard items (infra, plugins, services) linked to motherboard workspace |
| `health_component_mappings` | Backend | Maps health_checks.Components keys to service names (e.g. database→mongodb) |
| `assets` | Storage | File references |
| `casbin_rule` | Entitlement (Casbin) | RBAC policy rules (if Casbin uses motherboard DB) |

### Database: `auth`

| Collection | Source | Description |
|------------|--------|-------------|
| `users` | init_platform.js | Users with workspaceId, tenantId, email, roles |
| `roles` | init_platform.js, seed_roles.js | Roles with permissions (resource, actions) |
| `user_role_assignments` | init_platform.js, seed_roles.js | Links userId → roleId per workspace |
| `sessions` | Auth service | Active session tokens (for VerifyToken) |
| `otp_sessions` | Auth service | OTP verification sessions |
| `user_api_tokens` | Auth service | Long-lived API tokens for programmatic access |
| `oauth_tokens` | Auth service | OAuth access/refresh tokens |
| `clients` | Auth service | OAuth clients (clientId, clientSecret) |

### Database: `billing`

| Collection | Used By | Description |
|------------|---------|-------------|
| Billing-specific collections | Billing service | Subscriptions, usage, webhooks |

---

## 3. Service Auth / Identification Requirements

Each service needs to identify itself when calling another service or when the backend/auth validates its requests.

| Service | Identifies To | Mechanism |
|---------|---------------|-----------|
| **Backend API** | Auth Service | `AUTH_SERVICE_URL`; sends `Authorization: Bearer <user-token>` for user requests. No service-to-service token for VerifyToken — backend forwards user's token. |
| **Backend API** | Health Service | `HEALTH_SERVICE_URL` |
| **Backend API** | Billing Service | `BILLING_SERVICE_URL` |
| **Frontend** | Backend API | NextAuth session → Bearer token; `NEXTAUTH_URL`, `NEXT_PUBLIC_MOTHERBOARD_API_URL` |
| **Auth Service** | — | Validates tokens; stores users, sessions, roles. No outgoing auth calls for core flows. |
| **Entitlement** | — | Called by backend; uses MongoDB only. |
| **Health** | Backend | Health checks; `BACKEND_URL`, `SCHEDULER_URL` |
| **Notification** | Backend, MongoDB | `INTERNAL_SERVICE_SECRET` for service-to-service |
| **Cloud Adapter** | — | `INTERNAL_SERVICE_SECRET` |
| **Scheduler** | MongoDB, Task Tracker | `TASK_TRACKER_INTERNAL_URL` |
| **Billing** | MongoDB | Own DB; webhook secret for backend callbacks |

### Auth Flows Summary

1. **User → Frontend → Backend → Auth Service**  
   Frontend sends `Authorization: Bearer <session-token>`. Backend calls `GET /api/auth/verify` on auth service with that token. Auth service looks up session (and optionally user_api_tokens or oauth_tokens) and returns user/workspace.

2. **Backend → Plugins / Internal Services**  
   Backend may use `INTERNAL_SERVICE_SECRET` or signed JWTs (PluginTokenService) when proxying to plugins. Cloud-adapter and notification use `INTERNAL_SERVICE_SECRET`.

3. **Service → MongoDB**  
   Services connect via `MONGODB_URI` / `CRM_MONGODB_URI` and `DATABASE_NAME` / `DB_NAME`. No per-service MongoDB auth in local dev (single MongoDB instance).

---

## 4. Required Seed Data (Local)

### 4.1 Run Order

1. **init_platform.js** — Creates core workspace, plugins, entitlements, auth user, roles, assignments.
2. **seed_roles.js** — (Optional) Re-seed roles if users exist; backfills workspaceId.

### 4.2 init_platform.js Produces

**Database: motherboard**
- `workspaces`: 1 doc (Motherboard, slug: motherboard, _id: MOTHERBOARD_ID)
- `plugins`: 3 docs (crm, staff-management, integrations)
- `entitlements`: 3 docs (feature_crm, feature_staff, feature_integrations)

**Database: auth**
- `users`: 1 admin user (admin@motherboard.dev)
- `roles`: 1 superuser role
- `user_role_assignments`: 1 assignment (admin → superuser)

### 4.3 Fixed IDs (from init_platform.js)

```javascript
const MOTHERBOARD_ID = "69941dafdc8a4b11d13742d9";
const ADMIN_USER_ID = "69941dafdc8a4b11d13742da";
```

These IDs are hardcoded in seed scripts. Services and frontend expect a workspace with this ID.

### 4.4 Entitlement Marketplace

- Entitlement uses `plugins` and `workspace_plugins` in `motherboard`.
- `seed_entitlements.js` seeds `workspace_plugins` for the Motherboard workspace.
- Ensure `workspaces` has a document before running `seed_entitlements.js` (init_platform already does this).

---

## 5. Environment Variables for Local Auth / URLs

Add to `.ports.env` or service-specific `.env.local`:

| Variable | Service | Example (Docker) |
|----------|---------|------------------|
| `AUTH_SERVICE_URL` | Backend | `http://auth:8088` |
| `HEALTH_SERVICE_URL` | Backend | `http://health:8091` |
| `BILLING_SERVICE_URL` | Backend | `http://billing:8090` |
| `INTERNAL_SERVICE_SECRET` | Notification, Cloud-adapter | `motherboard-secret-2026` |
| `CRM_MONGODB_URI` | Backend, Health | `mongodb://mongodb:27017` |
| `DATABASE_NAME` / `DB_NAME` | Various | `motherboard` or `auth` or `billing` |
| `MONGODB_URI` / `MONGO_URI` | Entitlement, Billing, etc. | `mongodb://mongodb:27017` |
| `JWT_SECRET` | Auth, Backend | Same value across services |
| `NEXTAUTH_SECRET` | Frontend | For NextAuth session signing |
| `NEXT_PUBLIC_MOTHERBOARD_API_URL` | Frontend | `http://localhost:8080` |

---

## 6. Checklist for Local Setup

### MongoDB
- [ ] MongoDB running (e.g. `docker compose up mongodb -d`)
- [ ] Run `mongosh` against `mongodb://localhost:27017`
- [ ] Run `init_platform.js`: `mongosh < motherboard-infra/scripts/init_platform.js` (or from infra dir)
- [ ] (Optional) Run `seed_roles.js` if you add users later
- [ ] (Optional) Run `seed_entitlements.js` for workspace_plugins (uses workspace from init)

### Auth
- [ ] Auth service has `DB_NAME=auth`, `MONGODB_URI`
- [ ] Backend has `AUTH_SERVICE_URL` pointing to auth service
- [ ] `JWT_SECRET` matches between auth and backend (if used for signing)

### Service URLs (Docker)
- [ ] Backend: `AUTH_SERVICE_URL=http://auth:8088`
- [ ] Backend: `HEALTH_SERVICE_URL=http://health:8091`
- [ ] Health: `CRM_MONGODB_URI`, `DATABASE_NAME` (or `CRM_DB_NAME`) = motherboard

### Frontend
- [ ] `NEXT_PUBLIC_MOTHERBOARD_API_URL=http://localhost:8080` (or backend URL)
- [ ] `NEXTAUTH_URL=http://localhost:4020`

---

## 7. Quick Seed Commands

```bash
# From motherboard-infra
cd motherboard-infra

# Ensure MongoDB is running
docker compose up -d mongodb

# Run init (connects to localhost:27017 by default; use --host if Docker)
mongosh "mongodb://localhost:27017" scripts/init_platform.js

# Optional: seed roles (if users exist)
mongosh "mongodb://localhost:27017" scripts/seed_roles.js

# Optional: seed workspace_plugins (must have workspace in motherboard.workspaces)
mongosh "mongodb://localhost:27017/motherboard" scripts/seed_entitlements.js
```

---

## 8. Services Without MongoDB (or Minimal)

- **Chaukidar**: Redis only.
- **Config-manager**: May use MongoDB or file-based config.
- **Marketing**: Check if it uses MongoDB or external APIs.
- **Cloud-adapter**: `INTERNAL_SERVICE_SECRET`; may use MongoDB for config.
