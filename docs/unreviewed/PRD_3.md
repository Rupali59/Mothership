# PRD: Marketing Service

## Overview
The **Marketing Service** (`services/marketing`) aggregates marketing campaign metrics from advertising platforms (Google Ads, Meta Ads) into a standardized format for reporting.

| Property | Value |
|---|---|
| **Language** | Go |
| **Port** | 8082 (default) |
| **Status** | Early/Stub — minimal implementation |

---

## Data Model

### MarketingMetrics (`internal/models/metrics.go`)
| Field | Type | Description |
|---|---|---|
| `Platform` | String | `google_ads` \| `meta_ads` |
| `CampaignID` | String | External campaign identifier |
| `CampaignName` | String | Human-readable name |
| `Impressions` | Int64 | View count |
| `Clicks` | Int64 | Click count |
| `Spend` | Float64 | Amount spent |
| `Currency` | String | ISO currency code |
| `Conversions` | Int64 | Conversion count |
| `Date` | Time | Metric date |

### MarketingAdapter Interface
```go
GetCampaignMetrics(startDate, endDate time.Time) ([]MarketingMetrics, error)
```

---

## Current State
- Only has a `/health` endpoint
- Metrics model and adapter interface defined
- **No CRUD handlers or API endpoints** yet
