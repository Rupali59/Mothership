# JHora Plugin API Design

## Base URL

```
http://localhost:3130/api
```

---

## Authentication

Currently no authentication. Future: API key or JWT-based auth.

---

## Endpoints

### 1. Generate/Retrieve Horoscope

**POST** `/horoscope/generate`

Generate a new horoscope or retrieve cached one.

**Request Body**:

```json
{
  "birthDetails": {
    "date": "1992-09-05",
    "time": "00:09:00",
    "place": "Bhopal",
    "latitude": 23.25469,
    "longitude": 77.40289,
    "timezone": 5.5
  },
  "sections": ["basic", "charts", "dashas", "yogas", "doshas", "strengths"]
}
```

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "birthHash": "abc123def456...",
    "birthDetails": { ... },
    "sections": {
      "basic": { ... },
      "charts": { ... },
      "dashas": { ... },
      "yogas": { ... },
      "doshas": { ... },
      "strengths": { ... }
    }
  },
  "cached": true,
  "timestamp": "2026-02-05T10:30:00Z"
}
```

---

### 2. Get Horoscope by Hash

**GET** `/horoscope/:birthHash`

Retrieve complete horoscope data.

**Query Parameters**:

- `sections` (optional): Comma-separated list of sections

**Response** (200 OK):

```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2026-02-05T10:30:00Z"
}
```

---

### 3. Get Specific Chart

**GET** `/horoscope/:birthHash/charts/:division`

Get a specific divisional chart.

**Parameters**:

- `division`: D-1, D-2, D-3, ..., D-144

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "division": "D-9",
    "name": "navamsa",
    "planets": {
      "Ascendant": { "sign": "Virgo", "longitude": 19.3283 },
      "Sun": { "sign": "Virgo", "longitude": 18.4215 },
      ...
    }
  }
}
```

---

### 4. Get Dasha System

**GET** `/horoscope/:birthHash/dashas/:system`

Get specific dasha system.

**Parameters**:

- `system`: vimsottari | ashtottari | yogini | shodasottari

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "system": "vimsottari",
    "periods": [
      { "period": "Mercury-Mercury", "startDate": "1977-10-22 20:36:52" },
      { "period": "Mercury-Kethu", "1980-03-20 12:25:56" },
      ...
    ]
  }
}
```

---

### 5. Get Current Dasha

**GET** `/horoscope/:birthHash/dashas/current`

Get currently running dasha period.

**Query Parameters**:

- `date` (optional): YYYY-MM-DD (defaults to today)
- `system` (optional): vimsottari (default) | ashtottari | yogini | shodasottari

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "system": "vimsottari",
    "currentPeriod": {
      "period": "Sun-Kethu",
      "startDate": "2026-06-17 13:56:42",
      "endDate": "2026-10-23 10:05:55",
      "daysRemaining": 142
    }
  }
}
```

---

### 6. Get Yogas

**GET** `/horoscope/:birthHash/yogas`

Get yoga analysis.

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "summary": {
      "total_yogas_found": 15,
      "total_yogas_possible": 93,
      "total_raja_yogas_found": 0,
      "total_raja_yogas_possible": 3
    },
    "yogas": [
      {
        "name": "Vesi Yoga",
        "chart": "D1",
        "condition": "There is a planet other than Moon...",
        "result": "You will have a balanced outlook..."
      },
      ...
    ]
  }
}
```

---

### 7. Get Doshas

**GET** `/horoscope/:birthHash/doshas`

Get dosha analysis.

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "Kala Sarpa Dosha": {
      "present": false,
      "description": "There is no Kala Sarpa Dosha in this horoscope."
    },
    "Manglik Dosha": {
      "present": true,
      "severity": "mild",
      "description": "Though there is Mars dosha- due to following exceptions...",
      "exceptions": ["Mars in 2nd house and in signs of Gemini or Virgo"]
    },
    ...
  }
}
```

---

### 8. Get Planetary Strengths

**GET** `/horoscope/:birthHash/strengths`

Get all strength calculations.

**Query Parameters**:

- `type` (optional): shad_bala | bhava_bala | vimsopaka | ashtakavarga

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "shad_bala": {
      "Sun": {
        "sthana_bala": 189.6,
        "dig_bala": 178.49,
        "kaala_bala": 0.91,
        "chesta_bala": 0,
        "naisargika_bala": 60.0,
        "drik_bala": -14.34,
        "total": 414.66,
        "rupas": 6.91,
        "relative_strength": 1.38
      },
      ...
    },
    "bhava_bala": { ... },
    "vimsopaka_bala": { ... },
    "ashtakavarga": { ... }
  }
}
```

---

### 9. Health Check

**GET** `/health`

Check service health.

**Response** (200 OK):

```json
{
  "status": "healthy",
  "services": {
    "mongodb": "connected",
    "redis": "connected",
    "jhoraApi": "reachable"
  },
  "uptime": 3600,
  "timestamp": "2026-02-05T10:30:00Z"
}
```

---

## Error Responses

### 400 Bad Request

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid birth details",
    "details": {
      "field": "latitude",
      "issue": "must be between -90 and 90"
    }
  },
  "timestamp": "2026-02-05T10:30:00Z"
}
```

### 404 Not Found

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Horoscope not found for the given birth hash"
  },
  "timestamp": "2026-02-05T10:30:00Z"
}
```

### 500 Internal Server Error

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred",
    "details": "Contact support if this persists"
  },
  "timestamp": "2026-02-05T10:30:00Z"
}
```

### 503 Service Unavailable

```json
{
  "success": false,
  "error": {
    "code": "JHORA_API_UNAVAILABLE",
    "message": "JHora API is currently unavailable"
  },
  "timestamp": "2026-02-05T10:30:00Z"
}
```

---

## Rate Limiting

- **Limit**: 100 requests per 15 minutes per IP
- **Headers**:
  - `X-RateLimit-Limit`: 100
  - `X-RateLimit-Remaining`: 95
  - `X-RateLimit-Reset`: 1644067200

**Response** (429 Too Many Requests):

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests from this IP",
    "retryAfter": 900
  }
}
```

---

## Section Filters

When requesting horoscope data, you can filter by sections:

### Available Sections

- **basic**: calendar_info, bhava_chart, planetary_states, ayanamsa_value, julian_day
- **charts**: All divisional charts (D-1 through D-144)
- **dashas**: All dasha systems (vimsottari, ashtottari, yogini, shodasottari)
- **yogas**: Yoga analysis and raja yogas
- **doshas**: All dosha analyses (Kala Sarpa, Manglik, Pitru, etc.)
- **strengths**: Shad Bala, Bhava Bala, Vimsopaka Bala, Ashtakavarga
- **special**: Sahams, Upagrahas, Special Lagnas, Arudhas, Sphuta
- **full**: Complete response (all sections)

### Example

Request only basic info and charts:

```json
{
  "birthDetails": { ... },
  "sections": ["basic", "charts"]
}
```

---

## Versioning

API version is included in response headers:

```
X-API-Version: 1.0.0
```

Future versions will use URL versioning:

```
/api/v2/horoscope/generate
```
