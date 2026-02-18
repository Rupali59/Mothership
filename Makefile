.PHONY: lint lint-go lint-ts test scaffold validate-ports sync-ports update-ports docker-up docker-down

# Lint all Go modules in the workspace
lint-go:
	golangci-lint run ./...

# Lint TypeScript frontend
lint-ts:
	cd apps/admin-dashboard && npx next lint

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
