# Gateway Auth Migration — Implementation Plan

This document captures the implementation details for Phase 2 and Phase 3 of the Gateway Auth Migration. It updates the high-level plan with file references and concrete steps.

---

## Phase 2: Implementation Plan (Complete)

### 2.1 AuthServiceMiddleware

- **File:** `apps/motherboard/backend/internal/middleware/auth_service.go`
- **Behavior:** Extracts `Authorization: Bearer` token; calls `AuthClient.VerifyToken` (session/user-api-token) or `AuthClient.IntrospectOAuthToken` (OAuth); sets `userId`, `workspaceId`, `authType`, `scopes`, `clientId`, `sessionId` in Gin context
- **Router:** Applied via `middleware.AuthServiceMiddleware(authClient)` on protected routes

### 2.2 EnrichedContextMiddleware

- **File:** `apps/motherboard/backend/internal/middleware/enriched_context.go`
- **Behavior:** Builds `X-MB-Context` header with user/workspace/client/session info for outbound proxy requests to plugins and services
- **Router:** Applied on plugin proxy groups before `DynamicPluginProxyMiddleware` / `PluginProxyMiddleware`

### 2.3 PluginTokenService

- **File:** `apps/motherboard/backend/internal/jwt/plugin_token.go`
- **Behavior:** Signs/validates JWTs for service-to-service requests (plugin tokens, asset-scoped tokens)
- **Usage:** Injected into `DynamicPluginProxyMiddleware` for backend-to-plugin calls

### 2.4 Removed Redundant Auth Code

- **Deleted:** `internal/auth` (local DB-based auth), `internal/rbac/policy.go` (PolicyEngine), `internal/services/auth`
- **Replaced by:** AuthClient calls to auth service; no local policy evaluation

---

## Phase 3: Implementation Plan (Complete)

### 3.1 Core Asset Seeding

| Step | File | Change |
|------|------|--------|
| 1 | `scripts/init_platform.js` | Step 4: seed entitlements for Motherboard workspace (`feature_crm`, `feature_staff`, `feature_integrations`) into `mbDB.entitlements` |
| 2 | `scripts/init_platform.js` | Step 7: seed roles and `user_role_assignments` in `authDB` (superuser role with full permissions; assign all workspace users) |

**Standalone script:** `scripts/seed_roles.js` — run when users already exist; upserts superuser role and assigns all workspace users; backfills `workspaceId` for users with only `tenantId`

### 3.2 Gateway Dual-Check (Entitlement + RBAC)

| Step | File | Change |
|------|------|--------|
| 1 | `apps/motherboard/backend/internal/middleware/rbac.go` | Add `RBACMiddleware(authClient, resource, action)` delegating to `RequirePermission` |
| 2 | `apps/motherboard/backend/internal/router/router.go` | `/api/clients`: `EntitlementMiddleware("feature_crm")` + `RBACMiddleware(authClient, "client", "manage")` |
| 3 | `apps/motherboard/backend/internal/router/router.go` | `/api/integrations`: `EntitlementMiddleware("feature_integrations")` + `RBACMiddleware(authClient, "integration", "manage")` |
| 4 | `apps/motherboard/backend/internal/router/router.go` | `/api/websites`: `RBACMiddleware(authClient, "website", "manage")` |

**Resource/action mapping:**

| Route Group | Resource | Action | Entitlement |
|-------------|----------|--------|-------------|
| `/api/clients` | client | manage | feature_crm |
| `/api/integrations` | integration | manage | feature_integrations |
| `/api/websites` | website | manage | (core; RBAC only) |

**Auth service:** `services/auth/internal/handlers/authorization.go` — `CheckPermission` and `GetUserCapabilities` accept both `tenantId` and `workspaceId` (backend AuthClient sends `tenantId`)

### 3.3 Dual-Worker Auth Model

| Step | File | Change |
|------|------|--------|
| 1 | `services/auth/docs/AUTH_VALIDATION.md` | Document User Worker (session/OAuth/user-api-token; RBAC) vs Service/Asset Worker (plugin JWT; no RBAC) validation paths |

### 3.4 Backend RBAC Cleanup

- **Verified:** No `apps/motherboard/backend/internal/rbac` directory
- **Verified:** `apps/motherboard/backend/internal/middleware/rbac.go` uses AuthClient only; no local PolicyEngine

---

## Execution Order (Completed)

1. Core Asset Seeding — done
2. Gateway Dual-Check (RBACMiddleware + wire to routes) — done
3. Dual-Worker Auth (auth service documentation) — done
4. Backend RBAC cleanup — done
