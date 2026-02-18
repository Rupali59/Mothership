# JHora Plugin Implementation Plan

## Overview

This document outlines the implementation plan for the JHora plugin based on comprehensive analysis of the JHora API response structure (9565 lines, ~475KB JSON with 20+ major data sections).

---

## 1. Plugin Architecture

### 1.1 Directory Structure

```
plugins/verticals/astrology/jhora/
├── docs/
│   ├── data_schema.md          # ✅ Complete API data schema documentation
│   ├── implementation_plan.md  # This document
│   └── api_design.md          # API endpoint specifications
├── src/
│   ├── index.js               # Express server entry point
│   ├── config/
│   │   └── database.js        # MongoDB connection config
│   ├── models/
│   │   ├── horoscope.model.js # Main horoscope data model
│   │   └── cache.model.js     # Redis cache schema
│   ├── services/
│   │   ├── jhora-processor.service.js  # Core JHora data processor
│   │   ├── chart.service.js            # Divisional charts processing
│   │   ├── dasha.service.js            # Dasha systems processing
│   │   ├── strength.service.js         # Bala calculations processing
│   │   └── cache.service.js            # Redis caching layer
│   ├── controllers/
│   │   └── horoscope.controller.js     # API request handlers
│   ├── routes/
│   │   └── horoscope.routes.js         # API route definitions
│   └── utils/
│       ├── validators.js               # Input validation
│       └── formatters.js               # Response formatting
├── tests/
│   ├── unit/
│   │   ├── jhora-processor.test.js
│   │   └── formatters.test.js
│   └── integration/
│       └── api.test.js
├── Dockerfile
├── package.json
└── README.md
```

### 1.2 Technology Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MongoDB (document storage for horoscope data)
- **Cache**: Redis (fast lookups for birth details → horoscope mapping)
- **Validation**: Joi
- **Testing**: Jest
- **Logging**: Winston with Sentry integration

---

## 2. Data Model Design

### 2.1 MongoDB Schema

```javascript
// horoscope.model.js
const HoroscopeSchema = new Schema({
  // Unique identifier based on birth details
  birthHash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Input parameters (Ref: birth-details.schema.js)
  birthDetails: {
    type: BirthDetailsSchema,
    required: true
  },
  
  // Complete JHora API response (Composed from sub-schemas)
  horoscopeData: {
    ...BasicInfoSchema.obj,     // basic: calendar, bhava_chart, planetary_states...
    ...ChartsSchema.obj,        // charts: divisional_charts...
    ...DashasSchema.obj,        // dashas: graha_dashas, sade_sati...
    ...YogasDoshasSchema.obj,   // yogas, doshas...
    ...StrengthsSchema.obj,     // strengths: shad_bala, ashtakavarga...
    ...SpecialPointsSchema.obj  // special: sahams, upagrahas, special_lagnas...
  },
  
  // Metadata
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  sourceApi: { type: String, default: 'jhora' },
  apiVersion: String
});
```

### 2.2 Redis Cache Strategy

```javascript
// Cache key format: "jhora:birth:{hash}"
// Value: MongoDB document ID
// TTL: 7 days (604800 seconds)

const cacheKey = `jhora:birth:${birthHash}`;
const ttl = 7 * 24 * 60 * 60; // 7 days
```

**Cache Flow**:

1. Generate hash from birth details (date + time + lat + lon)
2. Check Redis cache
3. If hit: Fetch from MongoDB by ID
4. If miss: Fetch from JHora API → Store in MongoDB → Cache ID in Redis

---

## 3. Core Services

### 3.1 JHora Processor Service

**Purpose**: Process and validate raw JHora API responses

**Key Methods**:

```javascript
class JHoraProcessorService {
  // Validate complete API response structure
  validateResponse(data) {
    // Check for required sections
    // Validate data types
    // Return validation errors or null
  }
  
  // Extract specific sections
  extractBirthDetails(data) { }
  extractCalendarInfo(data) { }
  extractDivisionalCharts(data) { }
  extractYogas(data) { }
  extractDoshas(data) { }
  extractDashas(data) { }
  
  // Parse HTML dosha descriptions
  parseHtmlDosha(htmlString) {
    // Strip HTML tags
    // Extract key information
    // Return structured data
  }
  
  // Handle malformed JSON (from Vipin's code)
  loadJsonContent(rawContent) {
    // Intelligent brace matching
    // JSON repair logic
    // Return parsed object
  }
}
```

### 3.2 Chart Service

**Purpose**: Process divisional charts data

```javascript
class ChartService {
  // Get all divisional charts
  getAllCharts(horoscopeData) { }
  
  // Get specific chart (D1, D9, etc.)
  getChart(horoscopeData, division) { }
  
  // Get planetary positions in a chart
  getPlanetaryPositions(chart) { }
  
  // Format chart for visualization
  formatForDisplay(chart) {
    // Convert to 12-house grid format
    // Group planets by house
    // Return display-ready structure
  }
}
```

### 3.3 Dasha Service

**Purpose**: Process dasha systems

```javascript
class DashaService {
  // Get all dasha systems
  getAllDashas(horoscopeData) { }
  
  // Get specific dasha system
  getDashaSystem(horoscopeData, system) {
    // system: 'vimsottari' | 'ashtottari' | 'yogini' | 'shodasottari'
  }
  
  // Get current dasha period
  getCurrentDasha(dashaData, currentDate) {
    // Find active period based on date
  }
  
  // Get dasha periods in date range
  getDashaRange(dashaData, startDate, endDate) { }
}
```

### 3.4 Strength Service

**Purpose**: Process strength calculations

```javascript
class StrengthService {
  // Get Shad Bala (6-fold strength)
  getShadBala(horoscopeData) {
    // Parse matrix format
    // Return structured object
  }
  
  // Get Bhava Bala (house strength)
  getBhavaBala(horoscopeData) {
    // Parse string arrays
    // Return structured object
  }
  
  // Get Vimsopaka Bala
  getVimsopakaBala(horoscopeData, scheme) {
    // scheme: 1-4 (Parashara, Venkatesha, Shadbala, Jaimini)
  }
  
  // Get Ashtakavarga
  getAshtakavarga(horoscopeData) { }
}
```

### 3.5 Cache Service

**Purpose**: Redis caching layer

```javascript
class CacheService {
  // Generate birth hash
  generateBirthHash(birthDetails) {
    // Create unique hash from birth parameters
    // Use crypto.createHash('sha256')
  }
  
  // Check cache
  async get(birthHash) { }
  
  // Store in cache
  async set(birthHash, mongoId, ttl) { }
  
  // Invalidate cache
  async invalidate(birthHash) { }
}
```

---

## 4. API Design

### 4.1 Endpoints

#### POST /api/horoscope/generate

Generate or retrieve horoscope data.

**Request**:

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

**Response**:

```json
{
  "success": true,
  "data": {
    "birthHash": "abc123...",
    "birthDetails": { ... },
    "sections": {
      "basic": {
        "calendar_info": { ... },
        "bhava_chart": [ ... ],
        "planetary_states": { ... }
      },
      "charts": {
        "D-1_rasi": { ... },
        "D-9_navamsa": { ... }
      },
      "dashas": {
        "vimsottari": [ ... ],
        "current": { ... }
      },
      "yogas": { ... },
      "doshas": { ... },
      "strengths": { ... }
    }
  },
  "cached": true,
  "timestamp": "2026-02-05T10:15:00Z"
}
```

#### GET /api/horoscope/:birthHash

Retrieve cached horoscope by hash.

#### GET /api/horoscope/:birthHash/charts/:division

Get specific divisional chart (e.g., `/api/horoscope/abc123/charts/D-9`).

#### GET /api/horoscope/:birthHash/dashas/:system

Get specific dasha system (e.g., `/api/horoscope/abc123/dashas/vimsottari`).

#### GET /api/horoscope/:birthHash/dashas/current

Get current running dasha period.

### 4.2 Response Sections

Clients can request specific sections to reduce payload size:

- **basic**: calendar_info, bhava_chart, planetary_states, nakshatra_pada, ayanamsa_value, julian_day
- **charts**: All divisional charts or specific ones
- **dashas**: All dasha systems or specific one
- **yogas**: Yoga analysis
- **doshas**: Dosha analysis
- **strengths**: All bala calculations
- **special**: Sahams, upagrahas, special lagnas, arudhas, chara_karakas, amsa_rulers, etc.
- **full** (or **all**): Complete response (default)

---

## 5. Data Processing Pipeline

### 5.1 Request Flow

```
1. Client Request → Express Route Handler
2. Validate Input (Joi schema)
3. Generate Birth Hash
4. Check Redis Cache
   ├─ Cache Hit → Fetch from MongoDB → Format Response
   └─ Cache Miss ↓
5. Call JHora API (external)
6. Validate API Response
7. Store in MongoDB
8. Cache ID in Redis
9. Format Response
10. Return to Client
```

### 5.2 Error Handling

```javascript
// Custom error classes
class JHoraApiError extends Error { }
class ValidationError extends Error { }
class CacheError extends Error { }
class DatabaseError extends Error { }

// Error response format
{
  "success": false,
  "error": {
    "code": "JHORA_API_ERROR",
    "message": "Failed to fetch data from JHora API",
    "details": { ... }
  },
  "timestamp": "2026-02-05T10:15:00Z"
}
```

---

## 6. Integration with Motherboard

### 6.1 Docker Compose Configuration

```yaml
jhora-plugin:
  build:
    context: ./plugins/verticals/astrology/jhora
    dockerfile: Dockerfile
  container_name: jhora-plugin
  ports:
    - "3130:3130"
  environment:
    - NODE_ENV=production
    - PORT=3130
    - MONGODB_URI=mongodb://mongodb:27017/motherboard
    - REDIS_URL=redis://redis:6379
    - JHORA_API_URL=${JHORA_API_URL}
    - SENTRY_DSN=${SENTRY_DSN}
  depends_on:
    - mongodb
    - redis
  networks:
    - motherboard-network
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3130/health"]
    interval: 30s
    timeout: 10s
    retries: 3
```

### 6.2 Environment Variables

```bash
# .env
JHORA_API_URL=http://localhost:3129  # Or external JHora service
MONGODB_URI=mongodb://mongodb:27017/motherboard
REDIS_URL=redis://redis:6379
PORT=3130
NODE_ENV=production
SENTRY_DSN=https://...
LOG_LEVEL=info
CACHE_TTL=604800  # 7 days in seconds
```

---

## 7. Client Integration

### 7.1 Vipin-mb Client

Update existing Vipin client to use JHora plugin instead of direct processor:

```typescript
// vipin-mb/lib/services/jhora-client.service.ts
export class JHoraClientService {
  private baseUrl = process.env.JHORA_PLUGIN_URL;
  
  async generateHoroscope(birthDetails: BirthDetails) {
    const response = await fetch(`${this.baseUrl}/api/horoscope/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ birthDetails })
    });
    return response.json();
  }
  
  async getCurrentDasha(birthHash: string) {
    const response = await fetch(
      `${this.baseUrl}/api/horoscope/${birthHash}/dashas/current`
    );
    return response.json();
  }
}
```

### 7.2 SSJK-mb Client

Create new JHora client for SSJK:

```typescript
// ssjk-mb/lib/services/jhora-client.service.ts
// Similar structure to Vipin client
```

---

## 8. Testing Strategy

### 8.1 Unit Tests

```javascript
// tests/unit/jhora-processor.test.js
describe('JHoraProcessorService', () => {
  test('validates complete API response', () => { });
  test('extracts birth details correctly', () => { });
  test('parses HTML dosha descriptions', () => { });
  test('handles malformed JSON', () => { });
});

// tests/unit/formatters.test.js
describe('Response Formatters', () => {
  test('formats divisional charts', () => { });
  test('formats dasha periods', () => { });
  test('formats strength calculations', () => { });
});
```

### 8.2 Integration Tests

```javascript
// tests/integration/api.test.js
describe('Horoscope API', () => {
  test('POST /api/horoscope/generate - new horoscope', async () => {
    // Test full flow: API call → MongoDB → Redis → Response
  });
  
  test('POST /api/horoscope/generate - cached horoscope', async () => {
    // Test cache hit scenario
  });
  
  test('GET /api/horoscope/:hash/charts/D-9', async () => {
    // Test specific chart retrieval
  });
});
```

### 8.3 Test Data

Use `rupali.json` as reference test data:

- Store in `tests/fixtures/rupali.json`
- Use for validation and formatting tests
- Mock JHora API responses with this data

---

## 9. Performance Considerations

### 9.1 Optimization Strategies

1. **Lazy Loading**: Only process requested sections
2. **Streaming**: For large responses, use streaming JSON
3. **Compression**: Enable gzip compression for API responses
4. **Indexing**: MongoDB indexes on `birthHash`, `createdAt`
5. **Connection Pooling**: MongoDB and Redis connection pools
6. **Rate Limiting**: Prevent API abuse

### 9.2 Caching Strategy

- **L1 Cache (Redis)**: Birth hash → MongoDB ID mapping (7 days TTL)
- **L2 Cache (MongoDB)**: Complete horoscope data (permanent)
- **Cache Invalidation**: Manual invalidation endpoint for updates

---

## 10. Monitoring & Logging

### 10.1 Logging

```javascript
// Winston logger with Sentry integration
logger.info('Horoscope generated', {
  birthHash,
  cached: true,
  sections: ['basic', 'charts'],
  responseTime: 45
});

logger.error('JHora API error', {
  error: err.message,
  birthDetails,
  stack: err.stack
});
```

### 10.2 Metrics

Track:

- API response times
- Cache hit/miss ratio
- JHora API success/failure rate
- MongoDB query performance
- Redis connection health

---

## 11. Security

### 11.1 Input Validation

```javascript
const birthDetailsSchema = Joi.object({
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  time: Joi.string().pattern(/^\d{2}:\d{2}:\d{2}$/).required(),
  place: Joi.string().min(1).max(100).required(),
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  timezone: Joi.number().min(-12).max(14).required()
});
```

### 11.2 Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});

app.use('/api/', limiter);
```

---

## 12. Deployment Checklist

- [ ] Create Dockerfile
- [ ] Add to docker-compose.yml
- [ ] Configure environment variables
- [ ] Set up MongoDB indexes
- [ ] Configure Redis
- [ ] Set up Sentry error tracking
- [ ] Configure logging
- [ ] Set up health check endpoint
- [ ] Write API documentation
- [ ] Create Postman collection
- [ ] Update Vipin-mb client
- [ ] Create SSJK-mb client
- [ ] Write integration tests
- [ ] Performance testing
- [ ] Security audit

---

## 13. Future Enhancements

### Phase 2

- **Webhook Support**: Notify clients when horoscope is ready
- **Batch Processing**: Generate multiple horoscopes in one request
- **PDF Export**: Generate PDF reports
- **Chart Visualization**: SVG/Canvas chart rendering
- **Dasha Timeline**: Visual timeline component

### Phase 3

- **Real-time Transit Updates**: WebSocket for live transit data
- **Compatibility Analysis**: Compare two horoscopes
- **Prediction Engine**: ML-based predictions
- **Multi-language Support**: Translate dosha/yoga descriptions

---

## 14. Migration from Vipin Project

### 14.1 Code to Port

From `Vipin Kaushik/VipinKaushik/lib/services/jhora/`:

- `jhora-processor.service.ts` → Adapt to JavaScript
- JSON parsing logic (malformed JSON handling)
- Validation logic

### 14.2 Breaking Changes

- API endpoint structure changes
- Response format standardization
- Authentication/authorization (if added)

---

## Conclusion

This implementation plan provides a comprehensive roadmap for building the JHora plugin as a standalone microservice within the Motherboard ecosystem. The plugin will:

1. **Centralize** JHora data processing
2. **Cache** results for performance
3. **Standardize** API responses
4. **Enable** easy integration for multiple clients (Vipin-mb, SSJK-mb)
5. **Scale** independently from other services

**Next Steps**:

1. Review and approve this plan
2. Set up basic Express server structure
3. Implement MongoDB models
4. Port JHora processor service
5. Create API endpoints
6. Add Redis caching
7. Write tests
8. Deploy to Docker Compose
