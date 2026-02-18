# ⚠️ Error Code Dictionary

> **Version**: 1.0 | **Status**: Draft | **Applies to**: All microservices

## Standard Response Format
```json
{
  "success": false,
  "error": {
    "code": "ERR_BILLING_QUOTA_EXCEEDED",
    "message": "Monthly email quota exceeded",
    "details": { "limit": 10000, "current": 10001 }
  }
}
```

> [!NOTE]
> This replaces the existing free-text `error` field in `utils.ErrorResponse`. All services should migrate to this structured format.

---

## Global Error Codes

### Authentication & Auth (401/403)
| Code | HTTP | Description |
|---|---|---|
| `ERR_AUTH_INVALID_TOKEN` | 401 | JWT expired or malformed |
| `ERR_AUTH_SESSION_EXPIRED` | 401 | Session token has expired |
| `ERR_AUTH_WEBAUTHN_FAILED` | 401 | Biometric challenge rejected |
| `ERR_AUTH_MFA_REQUIRED` | 403 | User must complete 2FA |
| `ERR_AUTH_OTP_EXPIRED` | 401 | OTP code has expired |
| `ERR_AUTH_OTP_INVALID` | 401 | OTP code does not match |

### Workspace & Tenancy (403/404/409)
| Code | HTTP | Description |
|---|---|---|
| `ERR_WORKSPACE_NOT_FOUND` | 404 | Workspace ID does not exist |
| `ERR_WORKSPACE_SUSPENDED` | 403 | Access blocked due to billing/policy violation |
| `ERR_WORKSPACE_QUOTA_FULL` | 403 | Maximum workspace count reached for account |
| `ERR_TENANT_SLUG_CONFLICT` | 409 | Tenant slug already in use |

### Billing & Entitlements (402/403/429)
| Code | HTTP | Description |
|---|---|---|
| `ERR_BILLING_PAYMENT_FAILED` | 402 | Card declined or payment requires action |
| `ERR_BILLING_QUOTA_EXCEEDED` | 429 | Feature usage limit reached |
| `ERR_BILLING_SUBSCRIPTION_INACTIVE` | 403 | Subscription is paused or cancelled |
| `ERR_ENTITLEMENT_MISSING` | 403 | Feature not included in current plan |
| `ERR_ENTITLEMENT_EXPIRED` | 403 | Entitlement has passed its expiry date |

### Notifications (400/403)
| Code | HTTP | Description |
|---|---|---|
| `ERR_NOTIF_CHANNEL_DISABLED` | 403 | Plugin (e.g., WhatsApp) not enabled for workspace |
| `ERR_NOTIF_TEMPLATE_NOT_FOUND` | 404 | Notification template does not exist |
| `ERR_NOTIF_INVALID_EVENT` | 400 | Event payload fails schema validation |

### Resources (404/409/413)
| Code | HTTP | Description |
|---|---|---|
| `ERR_RESOURCE_NOT_FOUND` | 404 | Requested resource does not exist |
| `ERR_RESOURCE_CONFLICT` | 409 | Duplicate ID, slug, or unique constraint violation |
| `ERR_RESOURCE_TOO_LARGE` | 413 | File or payload exceeds size limit |

### Rate Limiting (429)
| Code | HTTP | Description |
|---|---|---|
| `ERR_RATE_LIMIT_EXCEEDED` | 429 | Too many requests; retry after `Retry-After` header |
