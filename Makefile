.PHONY: lint lint-go lint-ts test scaffold validate-ports sync-ports update-ports docker-up docker-down \
        seed-config gen-env bootstrap dev-backend dev-frontend dev

# Lint all Go modules in the workspace
lint-go:
	golangci-lint run ./...

# Lint TypeScript frontend
lint-ts:
	cd apps/frontend && npx next lint

# Lint everything
lint: lint-go lint-ts

# Run all Go tests
test:
	go test ./...

# Scaffold a new service
scaffold:
	@bash tools/scaffold-service.sh $(TYPE) $(NAME) $(PORT)

# Validate port assignments (reads from MongoDB, then ports.json)
validate-ports:
	@go run ./cmd/port-registry validate

# Sync ports.json into MongoDB (source of truth for running services)
sync-ports:
	@go run ./cmd/port-registry sync

# Update .env files with PORT from registry (MongoDB then ports.json)
update-ports:
	@go run ./cmd/port-registry update

# Docker
docker-up:
	docker compose -f docker-compose.yml -f docker-compose.local.yml up -d

docker-down:
	docker compose -f docker-compose.yml -f docker-compose.local.yml down

# ---- MongoDB source-of-truth workflow ----------------------------------------

# Seed entity_configs.json into MongoDB
seed-config:
	@go run ./cmd/seed-config

# Generate per-service .env.local files from MongoDB entity configs
gen-env:
	@go run ./cmd/gen-env --env local

# Full bootstrap: seed configs + ports + generate all env files
bootstrap: seed-config sync-ports gen-env

# ---- Local development (non-Docker) ------------------------------------------

# Start backend with .env.local pre-loaded so godotenv.Load() won't override vars
dev-backend:
	@set -a; . ./apps/core-server/.env.local; set +a; $(MAKE) -C apps/core-server dev

# Start frontend dev server on port 4020
dev-frontend:
	@$(MAKE) -C apps/frontend dev 2>/dev/null || (cd apps/frontend && npm run dev)

# Start both backend and frontend in parallel
dev:
	@$(MAKE) -j2 dev-backend dev-frontend
