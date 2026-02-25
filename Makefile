# Motherboard Platform — Root Makefile
#
# Usage:
#   make up                  Start the full platform
#   make up-core             Start infra + core services only (no plugins)
#   make down                Stop all platform containers
#   make build               Rebuild all platform images
#   make seed                Run all seed scripts in order
#   make seed-platform       Seed workspace + roles only
#   make seed-services       Seed satellite service registry
#   make seed-oauth          Seed OAuth clients + entitlements
#   make seed-config         Seed config-manager (Wave 2 — requires config-manager running)
#   make superuser           Seed superuser phone +918349780523 into workspace tathya
#   make client CLIENT=Tathya   Start a specific client (e.g. CLIENT=Tathya)
#   make client-down CLIENT=X   Stop a specific client
#   make push-envs           Push all client envs to config-manager + Chaukidar
#   make push-envs-client CLIENT=X  Push envs for one client
#   make logs SERVICE=x      Tail logs for a platform service
#   make ps                  Show running platform containers
#   make health              Hit all /health + /readyz endpoints
#   make clean               Remove stopped containers and dangling images

SHELL := /bin/bash
.DEFAULT_GOAL := help

# ─── Paths ────────────────────────────────────────────────────────────────────
INFRA_DIR      := $(shell pwd)/motherboard-infra
SCRIPTS_DIR    := $(INFRA_DIR)/scripts
GITHUB_DIR     := $(shell dirname $(shell pwd))
API_DIR        := $(shell pwd)/motherboard-api

# ─── Docker ───────────────────────────────────────────────────────────────────
COMPOSE        := docker compose -f $(INFRA_DIR)/docker-compose.yml
COMPOSE_CORE   := docker compose -f $(INFRA_DIR)/docker-compose.core.yml
DOCKER_BUILDKIT := 1
export DOCKER_BUILDKIT

# ─── Platform: up/down/build ──────────────────────────────────────────────────
.PHONY: up
up: ## Start the full platform (build if needed)
	@echo "Starting Motherboard platform..."
	$(COMPOSE) up --build -d
	@echo "Platform is up. Frontend: http://localhost:4020 | API: http://localhost:8080"

.PHONY: up-core
up-core: ## Start infra + core services only (mongodb, redis, minio, auth, backend, health)
	$(COMPOSE) up --build -d mongodb redis minio auth health backend config-manager

.PHONY: up-infra
up-infra: ## Start infrastructure only (mongodb, redis, minio)
	$(COMPOSE) up -d mongodb redis minio
	@echo "Waiting for MongoDB to be healthy..."
	@$(COMPOSE) wait mongodb 2>/dev/null || sleep 10

.PHONY: down
down: ## Stop all platform containers
	$(COMPOSE) down

.PHONY: build
build: ## Rebuild all platform images
	$(COMPOSE) build

.PHONY: ps
ps: ## Show running platform containers
	$(COMPOSE) ps

.PHONY: logs
logs: ## Tail logs for a service (make logs SERVICE=backend)
	$(COMPOSE) logs -f $(SERVICE)

# ─── Seed ─────────────────────────────────────────────────────────────────────
.PHONY: seed
seed: seed-platform seed-services seed-oauth seed-health-assets seed-health-component-mappings seed-config ## Run all seed scripts in order
	@echo "✅ All seeds complete."

.PHONY: seed-health-assets
seed-health-assets: ## Seed health assets for motherboard workspace (infra, plugins, services)
	@echo "Seeding health assets..."
	@if docker exec motherboard-mongodb mongosh --quiet motherboard --eval 'db.runCommand({ping:1})' >/dev/null 2>&1; then \
		docker exec -i motherboard-mongodb mongosh --quiet motherboard < $(SCRIPTS_DIR)/seed_health_assets.js; \
	else \
		mongosh "$${MONGODB_URI:-mongodb://localhost:27017}/motherboard" $(SCRIPTS_DIR)/seed_health_assets.js || \
		(echo ""; echo "❌ MongoDB not reachable. Ensure motherboard-mongodb is running."; exit 1); \
	fi

.PHONY: seed-health-component-mappings
seed-health-component-mappings: ## Seed health component mappings (health_checks key -> service name)
	@echo "Seeding health component mappings..."
	@if docker exec motherboard-mongodb mongosh --quiet motherboard --eval 'db.runCommand({ping:1})' >/dev/null 2>&1; then \
		docker exec -i motherboard-mongodb mongosh --quiet motherboard < $(SCRIPTS_DIR)/seed_health_component_mappings.js; \
	else \
		mongosh "$${MONGODB_URI:-mongodb://localhost:27017}/motherboard" $(SCRIPTS_DIR)/seed_health_component_mappings.js || \
		(echo ""; echo "❌ MongoDB not reachable. Ensure motherboard-mongodb is running."; exit 1); \
	fi

.PHONY: seed-platform
seed-platform: ## Seed workspace, admin user, roles, plugins (init_platform.js)
	@echo "Seeding platform (workspace + admin user + roles)..."
	@if docker exec motherboard-mongodb mongosh --quiet --eval 'db.runCommand({ping:1})' >/dev/null 2>&1; then \
		docker exec -i motherboard-mongodb mongosh < $(SCRIPTS_DIR)/init_platform.js; \
	else \
		mongosh mongodb://localhost:27017 $(SCRIPTS_DIR)/init_platform.js || \
		(echo ""; echo "❌ MongoDB not reachable. Ensure motherboard-mongodb is running."; exit 1); \
	fi

.PHONY: seed-roles
seed-roles: ## Seed superuser role + assignments (seed_roles.js)
	@echo "Seeding roles..."
	mongosh mongodb://localhost:27017 $(SCRIPTS_DIR)/seed_roles.js

.PHONY: seed-services
seed-services: ## Seed satellite service registry (seed_satellite_services.go)
	@echo "Seeding satellite services..."
	cd $(SCRIPTS_DIR) && go run seed_satellite_services.go

.PHONY: seed-oauth
seed-oauth: ## Seed OAuth clients + enable all entitlements (seed_oauth_clients.js)
	@echo "Seeding OAuth clients and entitlements..."
	mongosh mongodb://localhost:27017 $(SCRIPTS_DIR)/seed_oauth_clients.js

.PHONY: seed-config
seed-config: ## Seed config-manager with env values (requires MongoDB)
	@echo "Seeding config-manager..."
	mongosh mongodb://localhost:27017 $(SCRIPTS_DIR)/seed_config.js

.PHONY: sync-registry
sync-registry: ## Sync registration data from data/inventory/ to MongoDB
	@echo "Syncing registration data from folder to MongoDB..."
	@cd motherboard-infra && go run cmd/registration-sync/main.go

.PHONY: run-static-registry
run-static-registry: ## Run the static registry service (for preview environments)
	@echo "Starting static registry service on port 8111..."
	@cd motherboard-infra && go run cmd/static-registry-service/main.go

.PHONY: gen-envs
gen-envs: ## Generate .env.generated files per service from config-manager
	@echo "Generating .env.generated files..."
	$(SCRIPTS_DIR)/gen_envs.sh

.PHONY: superuser
superuser: ## Seed superuser: workspace tathya + phone +918349780523
	@echo "Seeding superuser (workspace: tathya, phone: +918349780523)..."
	@cd $(API_DIR) && go run cmd/seed_mobile/main.go
	@echo "Now run the mongosh commands in CLAUDE.md Step 3 to complete RBAC setup."

# ─── Client management ────────────────────────────────────────────────────────
.PHONY: client
client: ## Start a specific client (make client CLIENT=Tathya)
ifndef CLIENT
	$(error CLIENT is required. Usage: make client CLIENT=Tathya)
endif
	@CLIENT_DIR=$$(find $(GITHUB_DIR) -maxdepth 3 -name "$(CLIENT)-mb" -type d 2>/dev/null | head -1); \
	if [ -z "$$CLIENT_DIR" ]; then \
		echo "❌ Client folder $(CLIENT)-mb not found under $(GITHUB_DIR)"; \
		exit 1; \
	fi; \
	echo "Starting $(CLIENT) from $$CLIENT_DIR ..."; \
	docker compose -f "$$CLIENT_DIR/docker-compose.yml" up --build -d; \
	echo "✅ $(CLIENT) is up."

.PHONY: client-down
client-down: ## Stop a specific client (make client-down CLIENT=Tathya)
ifndef CLIENT
	$(error CLIENT is required. Usage: make client-down CLIENT=Tathya)
endif
	@CLIENT_DIR=$$(find $(GITHUB_DIR) -maxdepth 3 -name "$(CLIENT)-mb" -type d 2>/dev/null | head -1); \
	if [ -z "$$CLIENT_DIR" ]; then \
		echo "❌ Client folder $(CLIENT)-mb not found"; \
		exit 1; \
	fi; \
	docker compose -f "$$CLIENT_DIR/docker-compose.yml" down

.PHONY: client-all
client-all: ## Start all 15 clients
	@echo "Starting all clients..."
	@STARTED=0; \
	for mb_dir in $$(find $(GITHUB_DIR) -maxdepth 3 -name "*-mb" -type d 2>/dev/null | sort); do \
		if [ -f "$$mb_dir/docker-compose.yml" ]; then \
			echo "Starting $$(basename $$mb_dir)..."; \
			docker compose -f "$$mb_dir/docker-compose.yml" up --build -d && STARTED=$$((STARTED+1)) || true; \
		fi; \
	done; \
	echo "✅ Started $$STARTED clients."

# ─── Env push ─────────────────────────────────────────────────────────────────
.PHONY: push-envs
push-envs: ## Push all client envs to config-manager + trigger Chaukidar sync
	@echo "Pushing client envs to config-manager..."
	$(SCRIPTS_DIR)/push_client_envs.sh

.PHONY: push-envs-client
push-envs-client: ## Push envs for one client (make push-envs-client CLIENT=Tathya)
ifndef CLIENT
	$(error CLIENT is required. Usage: make push-envs-client CLIENT=Tathya)
endif
	$(SCRIPTS_DIR)/push_client_envs.sh --client $(CLIENT)

# ─── Health check ─────────────────────────────────────────────────────────────
.PHONY: health
health: ## Check health of all platform services
	@echo "Checking platform service health..."
	@echo ""
	@services="backend:8080/readyz auth:8088/readyz billing:8090/health entitlement:8085/health health:8091/health notification:8094/health storage:8098/health config-manager:8100/readyz"; \
	for svc in $$services; do \
		name=$${svc%%:*}; \
		endpoint=$${svc#*:}; \
		status=$$(curl -sf "http://localhost:$$endpoint" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','?'))" 2>/dev/null || echo "unreachable"); \
		if [ "$$status" = "ok" ] || [ "$$status" = "ready" ]; then printf "  ✅ %-20s %s\n" "$$name" "$$status"; \
		else printf "  ❌ %-20s %s\n" "$$name" "$$status"; fi; \
	done

# ─── Cleanup ──────────────────────────────────────────────────────────────────
.PHONY: clean
clean: ## Remove stopped containers and dangling images
	docker container prune -f
	docker image prune -f

.PHONY: clean-all
clean-all: ## Full reset: stop platform, remove volumes (WARNING: data loss)
	$(COMPOSE) down -v
	docker image prune -f

# ─── Help ─────────────────────────────────────────────────────────────────────
.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}' \
		| sort
	@echo ""
	@echo "Examples:"
	@echo "  make up"
	@echo "  make seed"
	@echo "  make client CLIENT=Tathya"
	@echo "  make push-envs"
	@echo "  make health"
