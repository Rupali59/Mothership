# PRD: Stripe Plugin

> **Scope**: Stripe integration used by the Billing Service.

## Overview
- **Location**: `plugins/stripe`
- **Package**: `github.com/Rupali59/Motherboard/plugins/stripe`
- **Language**: Go (Gin framework)

### API
| Method | Path | Description |
|---|---|---|
| POST | `/payment-intents` | Create Stripe PaymentIntent |
| POST | `/refunds` | Refund a payment |
| POST | `/subscriptions` | Create subscription |
| POST | `/subscriptions/cancel` | Cancel subscription |
| POST | `/webhooks` | Receive Stripe webhooks |
| GET | `/health` | Health check |

### Request: Create PaymentIntent
```json
{
  "amount": 4999,
  "currency": "usd",
  "metadata": { "workspaceId": "ws_123" }
}
```

### Webhook Security
- Validates `Stripe-Signature` header
- Uses Stripe SDK's `ConstructEvent()` for verification
- **TODO**: Forward verified events to Billing Service

### Provider (`internal/provider/stripe.go`)
- `CreatePaymentIntent(amount, currency, metadata)`
- `RefundPayment(paymentIntentID, amount)`
- `CreateSubscription(customerID, priceID)`
- `CancelSubscription(subscriptionID)`
- `ConstructEvent(body, signature, webhookSecret)`

### Environment
| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | API secret key |
| `STRIPE_WEBHOOK_SECRET` | Webhook verification secret |
| `PORT` | Service port |
