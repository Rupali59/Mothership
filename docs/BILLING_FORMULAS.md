# 💰 Billing Logic & Formulas

> **Version**: 1.0 | **Status**: Draft | **Ref**: `services/billing`

## 1. Invoice Calculation

The total invoice amount is calculated as:

```
Total = Base Price + Σ(Overage × Rate) - Credits
```

### Example
A **Pro** plan ($49/mo) with 12,000 emails sent (limit: 10,000):
```
Base Price  = $49.00
Overage     = (12,000 - 10,000) × $0.001 = $2.00
Credits     = $0.00
────────────
Total       = $51.00
```

---

## 2. Proration (Mid-Cycle Plan Changes)

When a user changes plans mid-cycle, the charge is prorated based on remaining days.

### Formula
```
Unused Credit = Old Plan Price × (Remaining Days / Total Days)
New Charge    = New Plan Price × (Remaining Days / Total Days)
Net Charge    = New Charge - Unused Credit
```

### Worked Example
User upgrades from **Basic ($19)** to **Pro ($49)** on Day 15 of a 30-day month:
```
Unused Credit = $19 × (15/30) = $9.50
New Charge    = $49 × (15/30) = $24.50
Net Charge    = $24.50 - $9.50 = $15.00 (Charged Immediately)
```

### Downgrade Handling
User downgrades from **Pro ($49)** to **Basic ($19)** on Day 10 of a 30-day month:
```
Unused Credit = $49 × (20/30) = $32.67
New Charge    = $19 × (20/30) = $12.67
Net Credit    = $12.67 - $32.67 = -$20.00 (Applied as credit to next invoice)
```

> [!NOTE]
> Proration logic is **not yet implemented** in the codebase. The Billing Service (`services/billing/internal/services/billing/subscription.go`) handles subscription CRUD but does not calculate prorated amounts. This formula should be implemented in a new `proration.go` file.

---

## 3. Overage Rates

Metered usage beyond plan limits incurs overage charges. Limits are sourced from `PlanEntitlements` in `entitlement_sync.go`.

| Metric | Free | Basic | Pro | Enterprise | Overage Rate |
|---|---|---|---|---|---|
| **Emails** | 1,000 | 10,000 | 50,000 | Unlimited | $0.001/email |
| **SMS** | 0 | 5,000 | 25,000 | Unlimited | $0.02/SMS |
| **Storage** | 1 GB | 5 GB | 50 GB | Unlimited | $0.05/GB |
| **API Calls** | 10,000 | 100,000 | 1,000,000 | Unlimited | $0.0001/call |
| **Compute** | 100 min | 1,000 min | 10,000 min | Unlimited | $0.01/min |

---

## 4. Billing Cycle Logic

| Cycle | Duration | Discount |
|---|---|---|
| Monthly | 30 days | 0% |
| Quarterly | 90 days | 5% |
| Annual | 365 days | 20% |

### Renewal
- Invoices are generated **3 days before** cycle end
- Payment is attempted on **cycle end date**
- Grace period: **7 days** after failed payment
- After grace period: Subscription moves to `paused`, entitlements revoked

---

## 5. Refund Policy

| Scenario | Refund |
|---|---|
| Cancellation within 48 hours | Full refund |
| Cancellation mid-cycle (monthly) | No refund, access until end of cycle |
| Cancellation mid-cycle (annual) | Prorated refund of remaining months |
| Payment dispute (chargeback) | Investigated case-by-case |
