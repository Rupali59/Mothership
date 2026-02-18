# PRD: Entitlement Service

## Overview
The **Entitlement Service** (`services/entitlement`) provides fine-grained access control using the **Casbin** policy engine backed by MongoDB. It evaluates whether a user has permission to perform an action on a resource within a specific workspace (domain).

| Property | Value |
|---|---|
| **Language** | Go |
| **Port** | Configurable via `PORT` env |
| **Database** | MongoDB (via Casbin adapter) |
| **Policy Model** | RBAC with domain isolation |
| **Files** | 3 internal files + policies |

---

## Core Capabilities

### Policy Engine (`internal/policy/engine.go`)
Built on **Casbin** with MongoDB adapter:

| Method | Signature | Description |
|---|---|---|
| `CheckPermission` | `(sub, dom, obj, act) → bool` | Check if user has permission |
| `AddPolicy` | `(sub, dom, obj, act) → bool` | Add permission rule |
| `AddGroupingPolicy` | `(user, role, dom) → bool` | Assign role to user in workspace |
| `GetRolesForUser` | `(user, dom) → []string` | List user's roles in workspace |

**Parameters**:
- `sub` — Subject (user ID or role)
- `dom` — Domain (workspace ID)
- `obj` — Object (resource type: `integration`, `user`, `billing`)
- `act` — Action (`read`, `write`, `delete`, `admin`)

### API Handler (`internal/api/handler.go`)
HTTP layer for policy evaluation and management.

### RBAC Model
**File**: `policies/rbac_model.conf`

Domain-scoped RBAC ensuring workspace isolation — users in workspace A cannot access workspace B resources.

---

## Environment Variables
| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Policy storage |
| `PORT` | Service port |

---

## Status & Roadmap
| Feature | Status |
|---|---|
| Casbin RBAC engine | ✅ Implemented |
| MongoDB policy storage | ✅ Implemented |
| Domain-scoped permissions | ✅ Implemented |
| Role assignment API | ✅ Implemented |
| ABAC (Attribute-Based) | 🔲 Planned |
| Policy caching (Redis) | 🔲 Planned |
