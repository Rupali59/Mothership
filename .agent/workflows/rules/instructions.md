---
description: Workspace Rules for Gemini
---

# 🏗️ Architectural Vision

Structure: This project follows a Hybrid Monorepo with a Core + Satellite structure.

Logic: Domain-specific logic must be contained within independent Microservices.

Config: Use a Decoupled Push Model. Do not hardcode configurations; ensure satellites receive updates via the core's push mechanism.

## 💻 Language & Stack Guidelines

Backend (Gateway, Services, Cloud Workers): Use Go (Golang). Prioritize concurrency patterns and strict interface definitions.

Frontend (Shell): Use TypeScript/Next.js. Focus on modularity and ensuring the shell can ingest satellite-provided components or data.

Task Tracking: Use Python for the Task Tracker service logic.

## 🛡️ System Orchestration & Guardrails

System Quality > Code Quality: When refactoring, prioritize the health of the orchestration over local optimizations.

Autonomous Guardrails: Always implement automated checks or validation logic within the microservices to prevent cascading failures.

Error Handling: In Go services, use structured logging and ensure errors are wrapped with context before reaching the Gateway.

## 🤖 Agentic Behavior

When creating new satellites, automatically scaffold the necessary deployment manifests to ensure they fit the Core orchestration.

If a proposed change breaks the Decoupled Push Model, flag it as a "System Quality Violation" before proceeding.

## 📊 Observability & Reliability

**Sentry Integration**: All services (Go, Python, Next.js) must integrate Sentry for exception tracking and performance tracing. In Next.js, follow the custom span instrumentation for component actions and API calls.

**Structured Logging**: Use structured logging across all services. In Go, use `zap` or `slog`. In Python, use `structlog`. Ensure log levels (Info, Warn, Error, Fatal) are used appropriately.

**Health Checks**: Every satellite service must expose a `/health` endpoint that validates its internal state and connection to dependencies (e.g., MongoDB, Redis).

## 💾 Database Strategy

**MongoDB Modeling**: While MongoDB is schema-less, all collections must have a documented schema in the service's `README.md` or a `models/` directory.

**Indexing**: Explicitly define indexes for all query patterns. Use `mcp_mongodb-mcp-server_create-index` to ensure performance in production.

**Migrations**: Avoid breaking changes to existing documents; use additive migrations or versioned collections if necessary.

## 🎨 UI/UX Philosophy

**Premium Aesthetics**: All frontend components must deliver a "WOW" factor. Use curated HSL color palettes, glassmorphism, and smooth CSS transitions.

**Dynamic Interaction**: Implement micro-animations for user feedback. Interfaces should feel "alive" and responsive (e.g., hover states, loading skeletons, spring animations).

**No Placeholders**: Never use generic placeholders for images or icons. Use the `generate_image` tool or high-fidelity SVGs to maintain a premium feel.

## 🔒 Security & Config

**Secret Management**: NEVER hardcode API keys or secrets. Use environment variables and ensure they are documented in `.env.example` files.

**Decoupled Push Model**: Satellites should not pull configuration unless necessary. Prefer pushing configuration updates from the Core Gateway to Satellites to ensure synchronized state.

## 🛠️ Development Workflow

**Local Orchestration**: Use `./deploy.sh local up` to test multi-service interactions locally. Do not rely on manual process management for complex flows.

**PR Quality**: Every PR must include updated documentation (if logic changes) and verify that all service health checks pass.

**Dependency Management**: Use `go work` for Go services to maintain a consistent local workspace. For frontend, ensure `npm` dependencies are locked with `package-lock.json`.
