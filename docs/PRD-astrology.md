# PRD: Astrology Vertical (JHora + Vedika)

> **Location**: `plugins/verticals/astrology`
> **Status**: In Development

## Overview
The **Astrology Vertical** is a domain-specific plugin suite for Vedic astrology services. It consists of two sub-modules:

| Module | Purpose | Location |
|---|---|---|
| **JHora** | Birth chart (Kundli) generation | `plugins/verticals/astrology/jhora/` |
| **Vedika** | Vedic astrology computations | `plugins/verticals/astrology/vedika/` |

---

## JHora Module

### Structure
```
jhora/
├── docs/          # Documentation
├── src/
│   ├── config/    # Configuration
│   ├── controllers/  # HTTP controllers
│   ├── models/    # Data models (birth data, chart)
│   ├── routes/    # Express/Gin routes
│   ├── services/  # Business logic (calculations)
│   └── utils/     # Helper functions
```

### Capabilities
- Birth chart (Kundli) generation from date/time/place
- Planetary position calculations
- House system computations (Placidus, Whole Sign)
- Dasha (planetary period) calculations

---

## Vedika Module

### Structure
```
vedika/
├── src/
│   ├── config/    # Configuration
│   ├── controllers/  # HTTP controllers
│   ├── models/    # Data models
│   ├── routes/    # Routes
│   ├── services/  # Vedic computation services
│   └── utils/     # Helper utilities
```

### Capabilities
- Vedic astrological computations
- Muhurta (auspicious timing) calculation
- Compatibility matching (Kundli Milan)
- Transit analysis

---

## Integration with Motherboard
- Registers as a **Vertical Plugin** in the Scheduler's plugin registry
- Uses the **Entitlement Service** for plan-gated features
- Data stored in workspace-scoped MongoDB collections
- Health checks registered with the **Health Service**

---

## Status & Roadmap
| Feature | Status |
|---|---|
| JHora structure | ✅ Scaffolded |
| Vedika structure | ✅ Scaffolded |
| Birth chart generation | 🔲 In Development |
| Dasha calculations | 🔲 In Development |
| Compatibility matching | 🔲 Planned |
| REST API endpoints | 🔲 In Development |
