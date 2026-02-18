# 📡 Event Registry & Webhook Specification

> **Version**: 1.0 | **Status**: Draft | **Ref**: `services/notification`

## 1. Event Schema Registry
All events published to the Redis Stream `events.motherboard` must adhere to this structure.

### 1.1 `payment.failed`
**Producer**: Billing Service
**Urgency**: High
```json
{
  "event_type": "payment.failed",
  "workspace_id": "ws_...",
  "client_id": "billing-service",
  "data": {
    "subscription_id": "sub_123",
    "amount": 49.99,
    "currency": "USD",
    "failure_reason": "card_declined",
    "next_retry_at": "2026-02-12T00:00:00Z"
  },
  "actions": [
    {
      "label": "Update Payment Method",
      "target_endpoint": "/billing/payment-methods"
    }
  ]
}
```

### 1.2 `user.signup`
**Producer**: Auth Service
**Urgency**: Normal
```json
{
  "event_type": "user.signup",
  "workspace_id": "ws_...",
  "client_id": "auth-service",
  "data": {
    "user_id": "user_123",
    "email": "user@example.com",
    "auth_method": "webauthn"
  }
}
```

### 1.3 `subscription.activated`
**Producer**: Billing Service
**Urgency**: Normal
```json
{
  "event_type": "subscription.activated",
  "workspace_id": "ws_...",
  "client_id": "billing-service",
  "data": {
    "subscription_id": "sub_456",
    "plan": "pro",
    "amount": 49.00,
    "currency": "USD",
    "billing_cycle": "monthly"
  }
}
```

### 1.4 `entitlement.quota_exceeded`
**Producer**: Motherboard Server
**Urgency**: High
```json
{
  "event_type": "entitlement.quota_exceeded",
  "workspace_id": "ws_...",
  "client_id": "motherboard-server",
  "data": {
    "feature": "email",
    "limit": 10000,
    "current": 10001,
    "upgrade_suggestion": "pro"
  }
}
```

### 1.5 `scheduler.task_failed`
**Producer**: Scheduler Service
**Urgency**: High
```json
{
  "event_type": "scheduler.task_failed",
  "workspace_id": "ws_...",
  "client_id": "scheduler-service",
  "data": {
    "job_id": "job_789",
    "job_type": "github_sync",
    "error": "rate_limit_exceeded",
    "attempts": 3,
    "max_attempts": 3
  }
}
```

---

## 2. Webhook Security (Outgoing)

Clients receiving webhooks from Motherboard must verify signatures to prevent replay attacks and forgery.

**Header Specification**:
| Header | Value |
|---|---|
| `X-Motherboard-Signature` | `sha256=<hex_digest>` |
| `X-Motherboard-Timestamp` | Unix Epoch Seconds (e.g., `1707724800`) |

**Verification Logic (Python)**:
```python
def verify_signature(payload, signature, timestamp, secret):
    # 1. Replay Protection (5 min window)
    if abs(time.time() - int(timestamp)) > 300:
        return False
    
    # 2. Compute HMAC
    base = f"{timestamp}.{payload}"
    expected = hmac.new(secret.encode(), base.encode(), hashlib.sha256).hexdigest()
    
    # 3. Constant-time compare
    return hmac.compare_digest(f"sha256={expected}", signature)
```

**Verification Logic (Go)**:
```go
func VerifySignature(payload []byte, signature, timestamp, secret string) bool {
    // 1. Replay Protection (5 min window)
    ts, _ := strconv.ParseInt(timestamp, 10, 64)
    if abs(time.Now().Unix()-ts) > 300 {
        return false
    }
    
    // 2. Compute HMAC
    base := fmt.Sprintf("%s.%s", timestamp, string(payload))
    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write([]byte(base))
    expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
    
    // 3. Constant-time compare
    return hmac.Equal([]byte(expected), []byte(signature))
}
```

**Retry Policy**:
| Attempt | Delay |
|---|---|
| 1 | Immediate |
| 2 | 30 seconds |
| 3 | 2 minutes |
| 4 | 15 minutes |
| 5 | 1 hour |

After 5 failed attempts, the webhook endpoint is marked **inactive** and the workspace owner is notified.
