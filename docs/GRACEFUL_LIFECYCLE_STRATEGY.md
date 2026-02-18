# Graceful Startup & Shutdown Strategy

A robustness-focused strategy for service lifecycle management across the Motherboard platform.

---

## Table of Contents

1. [Critical Gap Analysis](#critical-gap-analysis)
2. [Current State Audit](#current-state-audit)
3. [Design Principles](#design-principles)
4. [Startup Strategy](#startup-strategy)
5. [Shutdown Strategy](#shutdown-strategy)
6. [Health Check Architecture](#health-check-architecture)
7. [Inter-Service Resilience](#inter-service-resilience)
8. [Docker Compose Orchestration](#docker-compose-orchestration)
9. [Implementation Reference](#implementation-reference)
10. [Rollout Plan](#rollout-plan)

---

## Critical Gap Analysis

These are the findings from a line-by-line audit of every `main.go`, every connection manager, every background goroutine, and every inter-service call path. Ordered by severity.

### GAP 1: TenantManager cleanup goroutine is never stopped

**File:** `apps/core-server/internal/database/database.go:62-63, 204-217`
**Severity:** High — goroutine leak + race condition on shutdown

The `TenantManager` starts a background goroutine in `GetTenantManager()`:
```go
go manager.startCleanup() // line 63
```

This goroutine runs on a 5-minute ticker and calls `cleanupInactiveConnections()`, which takes a write lock on the tenant map. The `cleanupStop` channel exists (line 43) and is listened on (line 211), but **nothing in the codebase ever sends to it**. The `Disconnect()` function (line 336-350) only disconnects the global client — it does not:
- Signal `cleanupStop`
- Close custom tenant connections
- Wait for the cleanup goroutine to exit

This means:
1. The cleanup goroutine runs forever (leaked after shutdown).
2. If `cleanupInactiveConnections()` is mid-execution during `Disconnect()`, it holds `m.mu.Lock()` and calls `delete(m.databases, tenantID)`. Meanwhile `Disconnect()` calls `Client.Disconnect()` on the global client. A tenant connection that shares the global client could have its underlying connection pool yanked out from under it while cleanup still references it.
3. Custom tenant connections (`conn.CustomURI == true`) have their own `*mongo.Client` instances. These are **never closed on shutdown** — only the global client is. Every custom tenant connection leaks.

### GAP 2: WebAuthn session cleanup goroutine is never stopped on shutdown

**File:** `apps/core-server/internal/auth/webauthn_session.go:44-46, 102-113`
**Severity:** Medium — goroutine leak

`NewWebAuthnSessionStorage()` starts a cleanup goroutine:
```go
storage.cleanupTicker = time.NewTicker(5 * time.Minute)
go storage.cleanup() // line 45
```

A `Stop()` method exists (line 116-120) but is **never called from main.go**. The cleanup goroutine (line 102) ranges over the ticker channel with `for range s.cleanupTicker.C` — when the ticker is stopped, this range exits. But since `Stop()` is never called, the goroutine runs forever. Same pattern duplicated in `services/auth/internal/auth/webauthn_session.go`.

### GAP 3: Core server has no drain period — immediate shutdown

**File:** `apps/core-server/main.go:217-223`
**Severity:** High — dropped requests during deployment

The core server receives SIGTERM and immediately calls `srv.Shutdown()`:
```go
<-quit
shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
if err := srv.Shutdown(shutdownCtx); err != nil { ... }
```

There is no drain period. The readiness probe (`/readyz`) is wired to `healthhttp.ReadinessHandler` which checks DB connectivity but **does not check a draining flag**. The `lifecycle.Server` package (which has drain logic) is imported but not used for the HTTP server — the core server creates its own `http.Server` directly.

This means during a rolling deployment:
1. SIGTERM arrives.
2. The server immediately stops accepting new connections.
3. The Docker Compose health check (hitting `/readyz`) will fail because the server is down, not because it reported 503 first.
4. Any request in flight at the load balancer that hasn't reached the server yet gets a connection refused.

The `pkg/lifecycle` package is imported solely for `RetryWithBackoff` — the `lifecycle.Server` with drain logic is unused.

### GAP 4: Scheduler job workers can leave jobs stuck in "running" state forever

**File:** `services/scheduler/internal/services/job/job.go:122-143, 145-224`
**Severity:** High — data corruption / job loss

The job processing loop:
```go
case <-ticker.C:
    s.processNextJob(ctx, workerID, log)
```

When the worker receives a stop signal, it returns immediately from the `select`. But `processNextJob` can be mid-execution — it uses `FindOneAndUpdate` to atomically claim a job (set status to "running", line 176), then calls `handler.Handle()`. If the process dies between claiming and completing:

1. The job status remains `"running"` in MongoDB.
2. No other worker will pick it up (they query for `"pending"` only).
3. There is no job recovery mechanism — no goroutine scans for stale "running" jobs.
4. The `StopWorkers()` call in `main.go` closes `stopChan` and calls `workerWg.Wait()`, but the worker can exit its select loop while `processNextJob` is still running — `processNextJob` is called synchronously inside the `case <-ticker.C` branch, but the `select` only checks `stopChan`/`ctx.Done()` **before** calling `processNextJob`. Once inside `processNextJob`, there's no cancellation check. A long-running handler blocks shutdown entirely.

The 5-second shutdown timeout in `main.go:155-159` will fire, and the process exits with the job stuck as "running".

### GAP 5: Redis Streams consumer has no graceful shutdown — unacknowledged messages will redeliver

**File:** `infrastructure/queue/consumer.go:29-37`
**Severity:** Medium — duplicate processing

The `Consumer.Read()` method calls `XReadGroup` with a blocking timeout. If the process shuts down while `Read()` is blocked:
1. The Redis connection is closed (by deferred `redis.Close()`).
2. `XReadGroup` returns an error.
3. Any message that was read but not yet `Ack()`'d will be redelivered to another consumer on restart.

This isn't catastrophic if handlers are idempotent, but **there's no indication that job handlers are designed to be idempotent**. The `processNextJob` function uses `FindOneAndUpdate` for job claiming (idempotent), but the actual handler execution and side effects (GitHub sync, webhook processing, task sync) may not be.

Additionally, there is no pending message recovery. If a consumer crashes after reading but before acking, those messages sit in the Pending Entries List (PEL) forever. No `XAUTOCLAIM` or `XCLAIM` logic exists.

### GAP 6: Billing service kills the previous instance with SIGKILL before the new one is ready

**File:** `services/billing/cmd/server/main.go:24-51`
**Severity:** High — downtime window on every restart

```go
func killProcessOnPort(port string) error {
    // ... find PID ...
    killCmd := exec.Command("kill", "-9", pid)  // SIGKILL, not SIGTERM
    killCmd.Run()
    time.Sleep(1 * time.Second)
}
```

Problems:
1. Uses `kill -9` (SIGKILL), not `kill -15` (SIGTERM). The old process gets no chance to run graceful shutdown. In-flight billing operations (payment processing, webhook handling) are terminated instantly.
2. The kill happens before the new instance has connected to the database or started its HTTP server. There's a guaranteed downtime window: old instance dead → 1 second sleep → new instance starts connecting to DB → new instance starts HTTP server. If DB connection takes 5 seconds, that's 6+ seconds of downtime.
3. This runs in production. The `killProcessOnPort` is called unconditionally — there's no `if cfg.Env == "development"` guard.
4. `lsof -t -i :PORT` can return multiple PIDs. All are killed with SIGKILL, including potentially unrelated processes bound to that port.

### GAP 7: Notification service shutdown does workers → DB disconnect in wrong order

**File:** `services/notification/cmd/server/main.go:34, 53, 146-155`
**Severity:** Medium — worker shutdown may fail silently

The defer stack (LIFO):
```go
defer logger.Sync()          // line 34 — runs LAST (deferred first)
defer database.Disconnect()  // line 53 — runs SECOND-TO-LAST
// ... then at line 146-155, explicit worker shutdown happens before defers run
```

The explicit shutdown sequence (lines 142-155) is:
1. `srv.Shutdown()` — stops HTTP server
2. `cancel()` — signals workers to stop
3. Wait for workers with 5-second timeout

Then defers run:
4. `database.Disconnect()`
5. `logger.Sync()`

This ordering is actually correct for the notification service. But the problem is subtler: if a pipeline worker (e.g., dispatcher) is mid-dispatch (making an HTTP call to a plugin) when `cancel()` fires, the dispatcher's context is cancelled. The HTTP call to the plugin gets cancelled. But the notification was already marked as "sent" in MongoDB before the HTTP call (this is the dispatcher's pattern). The notification is recorded as sent but the delivery was actually cancelled. There's no rollback or retry.

### GAP 8: Plugin proxy has no timeout, no circuit breaker, and leaks goroutines on dead plugins

**File:** `apps/core-server/internal/middleware/plugin_proxy.go:43, 96`
**Severity:** High — cascading failures

The reverse proxy uses `httputil.NewSingleHostReverseProxy` (line 43) with **no transport configuration**:
```go
proxy := httputil.NewSingleHostReverseProxy(targetURL)
```

This uses `http.DefaultTransport`, which has:
- No overall request timeout (the proxy will wait forever if the plugin hangs)
- 30-second dial timeout (reasonable but slow for a proxy)
- Default keep-alive and idle connection settings

If a plugin service is down or slow:
1. Every request proxied to it blocks for up to 30 seconds (dial timeout).
2. These blocked goroutines accumulate — each in-flight proxied request holds a goroutine.
3. The core server's goroutine count grows without bound.
4. Eventually the core server runs out of memory or file descriptors.
5. The `ErrorHandler` (line 67-74) fires after the timeout, returning 502, but by then the damage is done.

There's no circuit breaker to short-circuit calls to a known-dead plugin. Every single request to a dead plugin incurs the full timeout.

### GAP 9: Storage service GC goroutine ignores context — unkillable during shutdown

**File:** `services/storage/cmd/server/main.go:58-71`
**Severity:** Low-Medium — blocks shutdown

```go
go func() {
    ticker := time.NewTicker(24 * time.Hour)
    defer ticker.Stop()
    for range ticker.C {
        n, err := gc.Run(context.Background(), db.DB, s3Provider, cfg.GCBufferDays)
```

Two issues:
1. The goroutine only exits when the ticker is garbage-collected (which happens when the process exits). There's no select on a stop channel or context.
2. `gc.Run()` is called with `context.Background()`, so if GC is mid-run during shutdown, it can't be cancelled. GC deletes files from S3 — if it's mid-deletion, the 5-second shutdown timeout fires and the process is killed, potentially leaving S3 in an inconsistent state with the DB.

### GAP 10: Defer ordering makes logger unavailable when DB disconnect errors need logging

**File:** `apps/core-server/main.go:145-161`
**Severity:** Low — silent error swallowing

```go
defer func() {                           // (A) runs THIRD (deferred first)
    if err := logger.Sync(); err != nil { ... }
}()
defer func() {                           // (B) runs SECOND
    if err := database.Disconnect(); err != nil {
        log.Error("Error disconnecting", zap.Error(err))
    }
}()
defer func() {                           // (C) runs FIRST
    if err := errorreporting.Close(); err != nil {
        log.Warn("Error closing", zap.Error(err))
    }
}()
```

Go defers execute LIFO, so: (C) → (B) → (A). Error reporting closes first. Then DB disconnects and any error is logged via `log.Error()`. Then logger syncs last. This is actually the correct order — the logger is available when DB disconnect errors are logged because `Sync()` hasn't run yet.

However, the `log` variable (line 92) points to the logger obtained before defers. If `logger.Sync()` fails (e.g., disk full), the error is written to `os.Stderr` (line 149) — this is fine.

The real issue is that `healthClient.StopHeartbeat()` (line 188) is deferred after the DB and logger defers, so it runs before all of them. If the health heartbeat goroutine is mid-HTTP-call to the health service, `StopHeartbeat()` may block. If it blocks for more than the remaining shutdown budget, the DB and logger defers never execute.

### GAP 11: `LastAccess` update in TenantManager is not thread-safe

**File:** `apps/core-server/internal/database/database.go:77-84`
**Severity:** Medium — data race

```go
m.mu.RLock()
conn, ok := m.databases[tenantID]
m.mu.RUnlock()
if ok {
    conn.LastAccess = time.Now()  // WRITE under no lock
    return conn.Database, nil
}
```

`conn.LastAccess` is written without holding any lock. The read lock is released on line 79 before the write on line 82. Meanwhile, `cleanupInactiveConnections()` reads `conn.LastAccess` under a write lock (line 234). This is a data race — concurrent goroutines can read a torn `time.Time` value (it's a struct, not atomic). Under the Go memory model, this is undefined behavior.

### GAP 12: Billing service `killProcessOnPort` uses platform-specific commands

**File:** `services/billing/cmd/server/main.go:26`
**Severity:** Medium — fails silently in Docker

```go
cmd := exec.Command("lsof", "-t", "-i", ":"+port)
```

`lsof` is not available in Alpine Linux Docker images (which are used for all services). This command silently fails (returns error, which is swallowed on line 28-30), so in Docker the kill never happens. This means the function is a no-op in production Docker containers, which is accidentally fine, but makes the code misleading — it appears to be a safety mechanism but provides none.

### GAP 13: No service-level request tracing across the proxy chain

**Severity:** Medium — debugging blindness

When a request flows frontend → core-server → plugin-proxy → plugin → inventory, there is no correlation ID. Each service logs independently. If an order creation fails because the inventory service returned a 500, the only way to correlate the logs is by timestamp, which is unreliable under load. The plugin proxy adds `X-Workspace-ID` and `X-Forwarded-Host` headers but no trace/request ID.

### GAP 14: All `localhost` defaults in config create silent misconfiguration in Docker

**File:** Multiple config.go files (see below)
**Severity:** Medium — silent failures

Every service's config defaults to `localhost` URLs:
- `services/billing/internal/config/config.go:53-54` — `RAZORPAY_PLUGIN_URL` defaults to `http://localhost:8098`, `STRIPE_PLUGIN_URL` to `http://localhost:8099`
- `services/notification/internal/config/config.go:36-39` — all plugin URLs default to `http://localhost:808x`
- `apps/core-server/internal/config/config.go:299` — `BILLING_SERVICE_URL` defaults to `http://localhost:8080`

In Docker, services address each other by container name (e.g., `http://billing:8090`). If an environment variable is missing, the service silently falls back to `localhost`, which resolves to the container's own loopback. Requests go to the wrong place (or nowhere), and the error message is "connection refused" with no indication that a misconfigured default is the cause.

The core server has a production guard (`config.go:406-407`):
```go
if strings.Contains(c.MongoDBURI, "localhost") {
    return fmt.Errorf("production cannot use localhost database")
}
```

But this only applies to `MongoDBURI` and only in production. No other service URLs are validated, and no other service has this guard.

### GAP 15: `lifecycle.Server` shutdown hooks share a single context timeout — slow hook starves later hooks

**File:** `pkg/lifecycle/lifecycle.go:124-133`
**Severity:** Medium — silent data loss

```go
hookBudget := s.shutdownBudget - s.drainPeriod - 10*time.Second  // = 13s
hookCtx, hookCancel := context.WithTimeout(context.Background(), hookBudget)
defer hookCancel()

for _, fn := range s.onShutdown {
    fn(hookCtx)  // all hooks share the same context + deadline
}
```

Hooks run sequentially but share a single context deadline. If hook 1 (worker shutdown) takes 12 of the 13 seconds, hook 2 (database disconnect) gets 1 second. If it doesn't disconnect in time, the context cancels, and `db.Disconnect()` aborts — potentially leaving connections half-closed.

Each hook should get its own sub-budget, or at minimum the remaining time should be recalculated between hooks.

---

## Current State Audit

### Services with graceful shutdown

| Service | Signal Handling | DB Cleanup | Drain Period | Worker Confirmation |
|---------|:-:|:-:|:-:|:-:|
| Core backend (`apps/core-server`) | SIGINT/SIGTERM | Yes (deferred) | **No** | N/A |
| Billing (`services/billing`) | SIGINT/SIGTERM | Yes (deferred) | No | N/A |
| Notification (`services/notification`) | SIGINT/SIGTERM | Yes (deferred) | No | **Yes** (WaitGroup) |
| Health (`services/health`) | SIGINT/SIGTERM | Yes (deferred) | No | N/A |
| Storage (`services/storage`) | SIGINT/SIGTERM | Yes (deferred) | No | **No** (GC goroutine) |
| Scheduler (`services/scheduler`) | SIGINT/SIGTERM | Yes (deferred) | No | **Yes** (WaitGroup) |

### Services without graceful shutdown

| Service | Issue |
|---------|-------|
| Auth | Bare `r.Run()`. No signal handling. DB never disconnected. |
| Entitlement | Bare `r.Run()`. No signal handling. |
| Marketing | `http.ListenAndServe`. No graceful shutdown. |
| Cloud adapter | `http.ListenAndServe`. No graceful shutdown. |
| Task tracker | Bare `r.Run()`. No signal handling. |
| All 6 communication/payment plugins | Bare `r.Run()`. Drop in-flight requests on SIGTERM. |
| Inventory plugin | Bare `r.Run()`. DB deferred but never triggered. |
| Orders plugin | Same as inventory. |
| Frontend | Node/Docker default SIGTERM handling. |

---

## Design Principles

**1. Fail slow on startup, fail fast on runtime.**
Retry dependency connections at startup with backoff. Once running, a persistently unhealthy dependency triggers circuit breakers, not infinite retries.

**2. Shutdown order is the reverse of startup order.**
Stop accepting new work first. Drain in-flight work. Close outbound connections last. Close the database connection last of all.

**3. Every service must handle SIGTERM.**
Docker sends SIGTERM on `docker stop`. If a service doesn't handle it, the process is killed after the stop timeout and in-flight work is lost.

**4. Health is a spectrum, not a boolean.**
A service can be live (process running), ready (dependencies connected, able to serve), and started (initial setup complete). Three distinct states, three distinct probes.

**5. Idempotent shutdown.**
Calling shutdown twice must not panic, double-close channels, or corrupt state.

---

## Startup Strategy

### Phase 1: Infrastructure readiness with backoff

Before any service starts its HTTP server, it must confirm its dependencies are reachable:

```
Service Process Start
  │
  ▼
1. Load config + logger (no retries needed)
  │
  ▼
2. Connect to dependencies with backoff
   MongoDB: up to 30s, 5 attempts
   Redis:   up to 15s, 3 attempts
   MinIO:   up to 15s, 3 attempts
   Between attempts: 1s → 2s → 4s → 8s (capped)
  │
  ▼
3. Run migrations / ensure indexes
  │
  ▼
4. Start background workers (if any) with context cancellation
  │
  ▼
5. Mark service as READY (readiness probe returns 200)
  │
  ▼
6. Start HTTP server (liveness probe returns 200)
  │
  ▼
7. Register with health service (if applicable)
```

### Phase 2: Dependency startup ordering

**Tier 0 — Infrastructure (no dependencies):**
```
mongodb, redis, minio
```

**Tier 1 — Core services (depend on infrastructure only):**
```
core-server, entitlement, auth
```

**Tier 2 — Business services (depend on Tier 1):**
```
billing, notification, scheduler, storage, health, task-tracker
```

**Tier 3 — Plugins (depend on core-server for proxy routing):**
```
email, sms, whatsapp, telegram, stripe, razorpay
```

**Tier 4 — Business plugins (depend on infrastructure + each other):**
```
inventory (depends on mongodb)
orders (depends on mongodb + inventory)
```

**Tier 5 — Frontend (depends on core-server):**
```
admin-dashboard
```

**Tier 6 — Monitoring and adapters (can start in any order):**
```
marketing, cloud-adapter
```

### Phase 3: Warm-up before traffic

- **Core server:** Warm the tenant connection pool for active workspaces.
- **Entitlement service:** Load Casbin policy model into memory before marking ready.
- **Notification service:** Ensure all 4 pipeline workers are running before marking ready.
- **Scheduler:** Confirm job workers are polling before marking ready.

The readiness probe must not return 200 until warm-up is complete.

---

## Shutdown Strategy

### Shutdown sequence

Every service must follow this sequence on SIGTERM/SIGINT:

```
SIGTERM received
  │
  ▼
1. Set state to DRAINING
   Readiness probe returns 503
   Liveness probe still returns 200
  │
  ▼
2. Wait for drain period (3 seconds)
   Load balancers stop routing new traffic.
   New requests during drain get 503.
  │
  ▼
3. Stop HTTP server (server.Shutdown)
   Stops accepting new connections.
   Waits for in-flight requests to complete.
   Timeout: 10 seconds.
  │
  ▼
4. Cancel background worker context
   Workers receive ctx.Done().
   Wait for workers to confirm exit (WaitGroup).
   Timeout: 5 seconds.
  │
  ▼
5. Deregister from health service
  │
  ▼
6. Close outbound clients
   HTTP clients, Redis connection, message broker.
  │
  ▼
7. Close database connections
   Stop TenantManager cleanup goroutine.
   Close all custom tenant connections.
   Disconnect global MongoDB client (10-second timeout).
  │
  ▼
8. Flush logger buffers
   Exit with code 0.
```

### Shutdown timeouts

Total budget must fit within Docker's stop timeout (set to 30s):

| Phase | Budget | Cumulative |
|-------|--------|------------|
| Drain period | 3s | 3s |
| HTTP server shutdown | 10s | 13s |
| Worker drain | 5s | 18s |
| Health deregister | 1s | 19s |
| Client close | 1s | 20s |
| DB disconnect | 5s | 25s |
| Logger flush | 1s | 26s |
| **Buffer** | **4s** | **30s** |

Set `stop_grace_period: 30s` in Docker Compose for all services.

### Worker shutdown with confirmation

```go
// At startup
var wg sync.WaitGroup

wg.Add(4)
go func() { defer wg.Done(); ingestor.Start(ctx) }()
go func() { defer wg.Done(); templater.Start(ctx) }()
go func() { defer wg.Done(); dispatcher.Start(ctx) }()
go func() { defer wg.Done(); callbackHandler.Start(ctx) }()

// At shutdown
cancel()

workerDone := make(chan struct{})
go func() { wg.Wait(); close(workerDone) }()

select {
case <-workerDone:
    logger.Info("all workers stopped cleanly")
case <-time.After(5 * time.Second):
    logger.Warn("worker shutdown timed out, proceeding")
}
```

Each worker must check `ctx.Done()` within its processing loop:

```go
func (d *Dispatcher) Start(ctx context.Context) {
    for {
        select {
        case <-ctx.Done():
            return
        case msg := <-d.inbox:
            d.process(msg)
        }
    }
}
```

### TenantManager shutdown (fixes GAP 1 and GAP 11)

The `Disconnect()` function must be rewritten:

```go
func Disconnect() error {
    if manager != nil {
        // Stop cleanup goroutine first
        close(manager.cleanupStop)

        // Close all custom tenant connections
        manager.mu.Lock()
        for tenantID, conn := range manager.databases {
            if conn.CustomURI && conn.Client != nil {
                ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
                conn.Client.Disconnect(ctx)
                cancel()
            }
            delete(manager.databases, tenantID)
        }
        manager.mu.Unlock()
    }

    // Disconnect global client
    if Client == nil {
        return nil
    }
    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()
    return Client.Disconnect(ctx)
}
```

Fix the `LastAccess` race (GAP 11) — update under write lock or use `atomic.Value`:

```go
func (m *TenantManager) GetDatabase(ctx context.Context, tenantID string) (*mongo.Database, error) {
    m.mu.RLock()
    conn, ok := m.databases[tenantID]
    m.mu.RUnlock()
    if ok {
        m.mu.Lock()
        conn.LastAccess = time.Now()
        m.mu.Unlock()
        return conn.Database, nil
    }
    // ... rest of function
}
```

### Scheduler job recovery (fixes GAP 4)

Add a stale job recovery goroutine:

```go
func (s *JobService) StartStaleJobRecovery(ctx context.Context, staleDuration time.Duration) {
    ticker := time.NewTicker(1 * time.Minute)
    defer ticker.Stop()
    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            cutoff := time.Now().Add(-staleDuration)
            filter := bson.M{
                "status":    models.JobStatusRunning,
                "startedAt": bson.M{"$lt": cutoff},
            }
            update := bson.M{
                "$set": bson.M{"status": models.JobStatusPending, "startedAt": nil},
                "$inc": bson.M{"attempts": 0}, // don't re-increment
            }
            result, _ := s.jobRepo.GetCollection().UpdateMany(ctx, filter, update)
            if result != nil && result.ModifiedCount > 0 {
                log.Warn("recovered stale jobs", zap.Int64("count", result.ModifiedCount))
            }
        }
    }
}
```

Call with `staleDuration` of 5 minutes — any job running longer than 5 minutes without completion is assumed to be from a dead worker.

---

## Health Check Architecture

### Three-probe model

| Probe | Endpoint | Meaning | When it fails |
|-------|----------|---------|---------------|
| **Liveness** | `GET /healthz` | Process is running and not deadlocked | Container should be restarted |
| **Readiness** | `GET /readyz` | Service can accept traffic | Stop routing traffic |
| **Startup** | `GET /startupz` | Initial startup completed | Don't kill yet, still initializing |

### Liveness probe (`/healthz`)

Lightweight. No dependency checks:

```go
r.GET("/healthz", func(c *gin.Context) {
    c.JSON(200, gin.H{"status": "alive"})
})
```

### Readiness probe (`/readyz`)

Checks dependencies and draining state:

```go
r.GET("/readyz", func(c *gin.Context) {
    if svc.State() == Draining {
        c.JSON(503, gin.H{"status": "draining"})
        return
    }

    checks := map[string]error{
        "mongodb": db.Ping(c.Request.Context()),
        "redis":   rdb.Ping(c.Request.Context()).Err(),
    }

    for name, err := range checks {
        if err != nil {
            c.JSON(503, gin.H{"status": "not_ready", "failed": name})
            return
        }
    }

    c.JSON(200, gin.H{"status": "ready"})
})
```

### Startup probe (`/startupz`)

```go
var startupComplete atomic.Bool

r.GET("/startupz", func(c *gin.Context) {
    if !startupComplete.Load() {
        c.JSON(503, gin.H{"status": "starting"})
        return
    }
    c.JSON(200, gin.H{"status": "started"})
})
```

---

## Inter-Service Resilience

### Retry with exponential backoff

```go
func RetryWithBackoff(ctx context.Context, maxAttempts int, baseSleep time.Duration, op func() error) error {
    var err error
    for attempt := 0; attempt < maxAttempts; attempt++ {
        if err = op(); err == nil {
            return nil
        }
        if attempt == maxAttempts-1 {
            break
        }
        sleep := baseSleep * time.Duration(1<<uint(attempt))
        if sleep > 8*time.Second {
            sleep = 8 * time.Second
        }
        jitter := time.Duration(rand.Int63n(int64(sleep) / 2)) - sleep/4
        sleep += jitter
        select {
        case <-ctx.Done():
            return ctx.Err()
        case <-time.After(sleep):
        }
    }
    return fmt.Errorf("failed after %d attempts: %w", maxAttempts, err)
}
```

### Circuit breaker for inter-service calls

Critical paths: orders→inventory, notification→plugins, core→plugin-proxy.

**Thresholds:**
- Open after 5 consecutive failures or >50% failure rate in 30 seconds
- Stay open for 10 seconds, then half-open
- In half-open, allow 1 probe request

```go
cb := gobreaker.NewCircuitBreaker(gobreaker.Settings{
    Name:        "inventory-service",
    MaxRequests: 1,
    Interval:    30 * time.Second,
    Timeout:     10 * time.Second,
    ReadyToTrip: func(counts gobreaker.Counts) bool {
        return counts.ConsecutiveFailures >= 5
    },
    OnStateChange: func(name string, from, to gobreaker.State) {
        logger.Warn("circuit breaker state change",
            zap.String("service", name),
            zap.String("from", from.String()),
            zap.String("to", to.String()))
    },
})
```

### HTTP client configuration (fixes GAP 8)

Replace `http.DefaultTransport` in all inter-service clients and plugin proxies:

```go
func NewServiceTransport() *http.Transport {
    return &http.Transport{
        MaxIdleConns:        20,
        MaxIdleConnsPerHost: 10,
        IdleConnTimeout:     90 * time.Second,
        DialContext: (&net.Dialer{
            Timeout:   3 * time.Second,
            KeepAlive: 30 * time.Second,
        }).DialContext,
        TLSHandshakeTimeout:   3 * time.Second,
        ResponseHeaderTimeout: 5 * time.Second,
    }
}

func NewServiceClient() *http.Client {
    return &http.Client{
        Timeout:   10 * time.Second,
        Transport: NewServiceTransport(),
    }
}
```

For the plugin proxy specifically:
```go
proxy := httputil.NewSingleHostReverseProxy(targetURL)
proxy.Transport = NewServiceTransport()
```

### Timeout budget for chained calls

Each hop must have a shorter timeout than its caller:

```
Frontend:  30s
  └→ Core:  15s
       └→ Orders:  10s
            └→ Inventory:  5s
```

### Request tracing (fixes GAP 13)

Add a request ID middleware at the core server level:

```go
func RequestIDMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        requestID := c.GetHeader("X-Request-ID")
        if requestID == "" {
            requestID = uuid.New().String()
        }
        c.Set("requestID", requestID)
        c.Header("X-Request-ID", requestID)
        c.Next()
    }
}
```

Propagate `X-Request-ID` in all inter-service calls and plugin proxy headers.

---

## Docker Compose Orchestration

### Health check configuration

All services use `/readyz` for health checks:

```yaml
mongodb:
  healthcheck:
    test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
    interval: 10s
    timeout: 5s
    retries: 5
    start_period: 10s

redis:
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 5s
    retries: 5
    start_period: 5s

backend:
  healthcheck:
    test: ["CMD", "wget", "--spider", "-q", "http://localhost:8080/readyz"]
    interval: 15s
    timeout: 5s
    retries: 3
    start_period: 30s
  stop_grace_period: 30s
  depends_on:
    mongodb:
      condition: service_healthy
    redis:
      condition: service_healthy

notification:
  healthcheck:
    test: ["CMD", "wget", "--spider", "-q", "http://localhost:8094/readyz"]
    interval: 15s
    timeout: 5s
    retries: 3
    start_period: 20s
  stop_grace_period: 30s
  depends_on:
    mongodb:
      condition: service_healthy
    redis:
      condition: service_healthy
    backend:
      condition: service_healthy

orders:
  healthcheck:
    test: ["CMD", "wget", "--spider", "-q", "http://localhost:8097/readyz"]
    interval: 15s
    timeout: 5s
    retries: 3
    start_period: 15s
  stop_grace_period: 30s
  depends_on:
    mongodb:
      condition: service_healthy
    inventory:
      condition: service_healthy
```

### `start_period` by tier

| Service tier | `start_period` |
|-------------|---------------|
| Infrastructure (mongo, redis, minio) | 5–10s |
| Core backend (runs migrations) | 30s |
| Microservices | 15–20s |
| Plugins (stateless) | 10s |
| Frontend (Next.js build) | 30s |

### Restart policies

```yaml
# Production
services:
  backend:
    restart: unless-stopped

  mongodb:
    restart: unless-stopped

  redis:
    restart: unless-stopped
```

Development: `restart: no` (default) so crashes are visible.

### Shutdown ordering

Docker Compose v2 shuts down in reverse dependency order. Verify with:
```bash
docker compose -f docker-compose.dev.yml down -t 30
```

---

## Implementation Reference

### Shared lifecycle package

**Location:** `pkg/lifecycle/lifecycle.go` (already exists)

The existing `pkg/lifecycle` package has correct structure but needs two fixes:

**Fix 1: Per-hook timeout budgets (GAP 15)**

```go
func (s *Server) shutdown() error {
    s.state.Store(StateDraining)
    s.logger.Info("entering drain period", zap.Duration("duration", s.drainPeriod))
    time.Sleep(s.drainPeriod)

    shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()
    if err := s.httpServer.Shutdown(shutdownCtx); err != nil {
        s.logger.Error("http server shutdown error", zap.Error(err))
    }

    // Give each hook an equal share of the remaining budget
    remaining := s.shutdownBudget - s.drainPeriod - 10*time.Second
    if len(s.onShutdown) > 0 {
        perHook := remaining / time.Duration(len(s.onShutdown))
        if perHook < 2*time.Second {
            perHook = 2 * time.Second
        }
        for i, fn := range s.onShutdown {
            hookCtx, hookCancel := context.WithTimeout(context.Background(), perHook)
            fn(hookCtx)
            hookCancel()
            s.logger.Debug("shutdown hook completed", zap.Int("hook", i))
        }
    }

    s.state.Store(StateStopped)
    s.logger.Info("shutdown complete")
    return nil
}
```

**Fix 2: Core server should use `lifecycle.Server` for HTTP serving, not just `RetryWithBackoff`**

The core server currently imports `lifecycle` but builds its own `http.Server` and signal handler. It should be migrated to use `lifecycle.Server.Run()` to get the drain period, readiness state management, and proper hook execution.

### Usage: simple service

```go
func main() {
    logger, _ := zap.NewProduction()
    cfg := config.Load()

    ctx := context.Background()
    var db *mongo.Client
    err := lifecycle.RetryWithBackoff(ctx, 5, 1*time.Second, func() error {
        var connErr error
        db, connErr = database.Connect(cfg.MongoURI)
        return connErr
    })
    if err != nil {
        logger.Fatal("failed to connect to MongoDB", zap.Error(err))
    }

    r := gin.New()
    // ... routes ...

    srv := lifecycle.New(r, cfg.Port, logger)

    srv.OnShutdown(func(ctx context.Context) { db.Disconnect(ctx) })
    srv.OnShutdown(func(_ context.Context) { logger.Sync() })

    srv.MarkReady()

    if err := srv.Run(); err != nil {
        logger.Fatal("server error", zap.Error(err))
    }
}
```

### Usage: service with background workers

```go
func main() {
    // ... setup ...

    srv := lifecycle.New(r, cfg.Port, logger)

    workerCtx, workerCancel := context.WithCancel(context.Background())
    var wg sync.WaitGroup

    wg.Add(4)
    go func() { defer wg.Done(); ingestor.Start(workerCtx) }()
    go func() { defer wg.Done(); templater.Start(workerCtx) }()
    go func() { defer wg.Done(); dispatcher.Start(workerCtx) }()
    go func() { defer wg.Done(); callbackHandler.Start(workerCtx) }()

    srv.MarkReady()

    srv.OnShutdown(func(ctx context.Context) {
        workerCancel()
        done := make(chan struct{})
        go func() { wg.Wait(); close(done) }()
        select {
        case <-done:
        case <-ctx.Done():
            logger.Warn("worker shutdown timed out")
        }
    })
    srv.OnShutdown(func(ctx context.Context) { db.Disconnect(ctx) })
    srv.OnShutdown(func(_ context.Context) { logger.Sync() })

    srv.Run()
}
```

---

## Rollout Plan

### Phase 1 — Fix critical gaps (do immediately)

| Task | Fixes Gap | Effort |
|------|-----------|--------|
| Fix `TenantManager.Disconnect()` to stop cleanup goroutine and close custom connections | GAP 1 | 2 hours |
| Fix `LastAccess` data race with proper locking | GAP 11 | 30 min |
| Remove `killProcessOnPort` from billing service | GAP 6 | 30 min |
| Add stale job recovery goroutine to scheduler | GAP 4 | 3 hours |
| Add `proxy.Transport` with timeouts to plugin proxy middleware | GAP 8 | 1 hour |
| Fix `lifecycle.Server.shutdown()` to use per-hook timeout budgets | GAP 15 | 1 hour |
| Add `stop_grace_period: 30s` to all Docker Compose services | All | 30 min |
| Add `start_period` to all Docker Compose healthchecks | All | 30 min |

### Phase 2 — Migrate broken services to `lifecycle.Server`

| Task | Services | Effort |
|------|----------|--------|
| Migrate auth service | auth | 1 hour |
| Migrate entitlement service | entitlement | 1 hour |
| Migrate task-tracker | task-tracker | 1 hour |
| Migrate marketing + cloud-adapter | marketing, cloud-adapter | 30 min each |
| Migrate all 6 communication/payment plugins | email, sms, whatsapp, telegram, stripe, razorpay | 30 min each |
| Migrate inventory + orders plugins | inventory, orders | 1 hour each |

### Phase 3 — Migrate core server to `lifecycle.Server`

| Task | Fixes Gap | Effort |
|------|-----------|--------|
| Replace manual `http.Server` + signal handler with `lifecycle.Server.Run()` | GAP 3 | 3 hours |
| Wire `WebAuthnSessionStorage.Stop()` into shutdown hooks | GAP 2 | 30 min |
| Wire `TenantManager` cleanup stop into shutdown hooks | GAP 1 | 30 min |
| Add request ID middleware and propagation | GAP 13 | 2 hours |

### Phase 4 — Resilience patterns

| Task | Fixes Gap | Effort |
|------|-----------|--------|
| Add circuit breaker to orders → inventory call | GAP 8 | 2 hours |
| Add circuit breaker to notification → plugin dispatch | GAP 8 | 2 hours |
| Add circuit breaker to plugin proxy middleware | GAP 8 | 2 hours |
| Add startup retry logic to all remaining MongoDB connections | — | 2 hours |
| Add PEL recovery (`XAUTOCLAIM`) to Redis Streams consumer | GAP 5 | 3 hours |
| Fix storage GC goroutine to use context + stop channel | GAP 9 | 1 hour |

### Phase 5 — Hardening

| Task | Fixes Gap | Effort |
|------|-----------|--------|
| Add `localhost` URL validation to all service configs in production mode | GAP 14 | 2 hours |
| Add notification dispatcher rollback on cancelled HTTP calls | GAP 7 | 3 hours |
| Make all job handlers idempotent (add idempotency keys) | GAP 5 | 1 day |
| Add structured shutdown duration logging to all services | — | 1 hour |
