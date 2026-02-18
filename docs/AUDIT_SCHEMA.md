# 🛡️ Audit Log Schema

> **Version**: 1.0 | **Status**: Draft | **Ref**: `apps/core-server/internal/models/audit_log.go`

Every write operation (POST/PUT/DELETE) generates an immutable log entry via `AuditMiddleware`.

## Schema Definition
```json
{
  "_id": "log_123",
  "workspaceId": "ws_abc",
  "userId": "user_xyz",
  "actorType": "user",
  "action": "PUT",
  "resource": "/api/v1/integrations/:id",
  "resourceId": "int_456",
  "ipAddress": "203.0.113.1",
  "userAgent": "Mozilla/5.0...",
  "timestamp": "2026-02-12T10:00:00Z",
  "details": {
    "path": "/api/v1/integrations/int_456",
    "status": 200,
    "duration_ms": 45,
    "request_body": { "enabled": true },
    "diff": {
      "before": { "enabled": false },
      "after": { "enabled": true }
    },
    "geo": {
      "country": "IN",
      "region": "MH",
      "city": "Mumbai"
    }
  }
}
```

## Field Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `_id` | ObjectID | Auto | Unique log identifier |
| `workspaceId` | ObjectID | Yes | Workspace scope |
| `userId` | ObjectID | Yes | Acting user |
| `actorType` | String | Yes | `user` \| `api_key` \| `system` |
| `action` | String | Yes | HTTP method or domain action |
| `resource` | String | Yes | API path or resource type |
| `resourceId` | String | No | Specific resource ID affected |
| `ipAddress` | String | No | Client IP |
| `userAgent` | String | No | Client user-agent |
| `timestamp` | DateTime | Yes | ISO 8601 UTC |
| `details` | Object | No | Extended context (see below) |

### Details Object (Enhanced)

| Field | Type | Description |
|---|---|---|
| `details.path` | String | Full request path |
| `details.status` | Int | HTTP response status code |
| `details.duration_ms` | Int | Request processing time |
| `details.request_body` | Object | Sanitized request body (PII redacted) |
| `details.diff` | Object | Before/after state for updates |
| `details.geo` | Object | GeoIP location data |

> [!IMPORTANT]
> The current `AuditMiddleware` only populates `details.path`. The enhanced fields (`status`, `duration_ms`, `diff`, `geo`) are proposed extensions that should be added.

## Retention Policy

| Tier | Storage | Duration | Use Case |
|---|---|---|---|
| **Hot** | MongoDB (Indexed) | 90 Days | Real-time queries, dashboard search |
| **Warm** | GCS (JSON/Parquet) | 1 Year | Compliance audits, incident review |
| **Cold** | Glacier / Archive | 7 Years | Regulatory retention (SOC2, GDPR) |

## Querying

### By Workspace (last 24 hours)
```javascript
db.audit_logs.find({
  workspaceId: ObjectId("..."),
  timestamp: { $gte: new Date(Date.now() - 86400000) }
}).sort({ timestamp: -1 })
```

### By User Action
```javascript
db.audit_logs.find({
  userId: ObjectId("..."),
  action: { $in: ["POST", "PUT", "DELETE"] }
})
```

## PII Handling
- Email addresses: Masked as `u***@example.com`
- Phone numbers: Last 4 digits only
- API keys: First 8 characters only
- Passwords/secrets: **Never logged**
