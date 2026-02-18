---
description: Test staging deployment of Health Service and Scheduler integration
---

# Test Staging Deployment

This workflow validates the integration between the Health Service and the Scheduler before deployment to staging.

1. **Verify Project Structure**
   Ensure all services are in the correct location and `go.work` includes them.
   ```bash
   cat go.work
   ```

2. **Build Health Service**
   // turbo
   ```bash
   cd services/health
   go mod tidy
   go build -v ./...
   ```

3. **Build Scheduler Service**
   // turbo
   ```bash
   cd services/scheduler
   go mod tidy
   go build -v ./cmd/server
   ```

4. **Validate Configuration**
   Check that `services/scheduler/internal/config/config.go` includes `HealthServiceURL` and `services/scheduler/cmd/server/main.go` initializes the health client.

   You can use `grep` to verify:
   ```bash
   grep -r "HealthServiceURL" services/scheduler/internal/config/config.go
   grep -r "healthclient.New" services/scheduler/cmd/server/main.go
   ```

5. **Local Integration Test (Manual)**
   - Start MongoDB and Redis (if not running).
   - Start Health Service: `PORT=4022 go run services/health/main.go`
   - Start Scheduler: `PORT=4021 HEALTH_SERVICE_URL=http://localhost:4022 go run services/scheduler/cmd/server/main.go`
   - Verify logs in both terminals:
     - Health Service should show "Registering service" logs.
     - Scheduler should show "Service registered with health monitoring".

6. **Push to Staging**
   If local tests pass, commit changes and push to the staging branch.
   ```bash
   git add .
   git commit -m "feat: Integrate Health Service provisioning in Scheduler"
   git push origin staging
   ```
