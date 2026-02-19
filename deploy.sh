#!/bin/bash

###############################################################################
# Motherboard Deployment Script
# Usage: ./deploy.sh [local|production] [command]
# 
# Examples:
#   ./deploy.sh local up          # Start local environment
#   ./deploy.sh production up -d  # Start production in background
#   ./deploy.sh production down   # Stop production
#   ./deploy.sh production logs   # View logs
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENV=${1:-local}
COMMAND=${2:-up}
EXTRA_ARGS="${@:3}"

###############################################################################
# Helper Functions
###############################################################################

print_banner() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║           MOTHERBOARD DEPLOYMENT MANAGER                   ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

check_requirements() {
    print_info "Checking requirements..."
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    print_success "All requirements met"
}

validate_env() {
    if [[ "$ENV" != "local" && "$ENV" != "preview" && "$ENV" != "production" ]]; then
        print_error "Invalid environment: $ENV"
        echo "Usage: ./deploy.sh [local|preview|production] [command]"
        exit 1
    fi
}

# check_go returns 0 if Go toolchain is available.
check_go() {
    command -v go &> /dev/null
}

# wait_for_mongodb polls until the MongoDB container reports healthy or times out.
wait_for_mongodb() {
    local max_wait=90
    local elapsed=0
    printf "  Waiting for MongoDB"
    while [ $elapsed -lt $max_wait ]; do
        local status
        status=$(docker inspect --format='{{.State.Health.Status}}' motherboard-mongodb 2>/dev/null || echo "not_found")
        if [ "$status" = "healthy" ]; then
            echo ""
            print_success "MongoDB is healthy"
            return 0
        fi
        sleep 2
        elapsed=$((elapsed + 2))
        printf "."
    done
    echo ""
    print_error "MongoDB did not become healthy within ${max_wait}s"
    exit 1
}

# bootstrap_config seeds MongoDB and generates per-service env files.
#
#   Phase 1  — start infra only (mongodb, redis, minio) and wait for healthy
#   Phase 2  — seed entity_configs.json into MongoDB (cmd/seed-config)
#   Phase 2b — sync ports.json into MongoDB (cmd/port-registry sync)
#   Phase 2c — generate .ports.env from ports.json (cmd/gen-ports-env)
#   Phase 3  — write per-service .env.$ENV files from MongoDB (cmd/gen-env --force)
#   Phase 4  — validate required env vars exist in generated files
#
bootstrap_config() {
    print_info "Phase 1 — Starting infrastructure services..."
    if [[ "$ENV" == "local" ]]; then
        docker-compose -f docker-compose.yml -f docker-compose.local.yml up mongodb redis minio -d
    else
        docker-compose -f docker-compose.yml -f docker-compose.prod.yml up mongodb redis minio -d
    fi

    wait_for_mongodb

    if ! check_go; then
        print_warning "Go is not installed — skipping seed and gen-env phases."
        print_warning "Install Go from https://go.dev/dl/ then run: ./deploy.sh $ENV setup"
        print_warning "Existing .env files will be used if already present."
        return 0
    fi

    print_info "Phase 2 — Seeding entity configs into MongoDB..."
    MONGODB_URI=mongodb://localhost:27017 go run ./cmd/seed-config || {
        print_error "seed-config failed — check MongoDB and seeds/data/global/entity_configs.json"
        exit 1
    }
    print_success "Entity configs seeded"

    print_info "Phase 2b — Syncing port registry into MongoDB..."
    MONGODB_URI=mongodb://localhost:27017 go run ./cmd/port-registry sync || {
        print_error "port-registry sync failed"
        exit 1
    }
    print_success "Port registry synced"

    print_info "Phase 2c — Generating .ports.env from ports.json..."
    go run ./cmd/gen-ports-env || {
        print_error "gen-ports-env failed"
        exit 1
    }
    print_success ".ports.env generated"

    print_info "Phase 2d — Validating docker-compose config..."
    if docker compose config --quiet 2>/dev/null; then
        print_success "Docker Compose config is valid"
    else
        print_warning "Docker Compose config validation failed — .ports.env vars may not resolve. Continuing anyway."
    fi

    print_info "Phase 3 — Generating per-service .env.$ENV files from MongoDB..."
    MONGODB_URI=mongodb://localhost:27017 go run ./cmd/gen-env --env "$ENV" --force || {
        print_error "gen-env failed — run: MONGODB_URI=mongodb://localhost:27017 go run ./cmd/gen-env --dry-run"
        exit 1
    }
    print_success "Environment files generated (.env.$ENV per service)"

    print_info "Phase 4 — Validating required environment variables..."
    validate_env_files
}

build_images() {
    print_info "Building Docker images for $ENV environment..."
    
    if [[ "$ENV" == "local" ]]; then
        docker-compose -f docker-compose.yml -f docker-compose.local.yml build
    else
        docker-compose -f docker-compose.yml -f docker-compose.prod.yml build
    fi
    
    print_success "Images built successfully"
}

# ensure_ports_env generates .ports.env if it doesn't exist.
# This guards against running `docker compose up` directly without deploy.sh.
ensure_ports_env() {
    if [[ ! -f ".ports.env" ]]; then
        print_warning ".ports.env not found — generating from ports.json..."
        if check_go; then
            go run ./cmd/gen-ports-env || {
                print_error "Failed to generate .ports.env — run: go run ./cmd/gen-ports-env"
                exit 1
            }
            print_success ".ports.env generated"
        else
            print_error ".ports.env is missing and Go is not installed to generate it."
            print_error "Either install Go or manually create .ports.env"
            exit 1
        fi
    fi
}

# validate_env_files checks that critical env vars are present in generated files.
validate_env_files() {
    local errors=0

    # Frontend must have HEALTH_SERVICE_URL
    if [[ -f "apps/frontend/.env.$ENV" ]]; then
        if ! grep -q "HEALTH_SERVICE_URL" "apps/frontend/.env.$ENV"; then
            print_warning "apps/frontend/.env.$ENV is missing HEALTH_SERVICE_URL"
            errors=$((errors + 1))
        fi
    elif [[ -f "apps/frontend/.env.local" ]]; then
        if ! grep -q "HEALTH_SERVICE_URL" "apps/frontend/.env.local"; then
            print_warning "apps/frontend/.env.local is missing HEALTH_SERVICE_URL"
            errors=$((errors + 1))
        fi
    fi

    # Backend must have service URLs
    local backend_env="apps/core-server/.env.$ENV"
    [[ ! -f "$backend_env" ]] && backend_env="apps/core-server/.env.local"
    if [[ -f "$backend_env" ]]; then
        for var in HEALTH_SERVICE_URL AUTH_SERVICE_URL BILLING_SERVICE_URL; do
            if ! grep -q "$var" "$backend_env"; then
                print_warning "$backend_env is missing $var"
                errors=$((errors + 1))
            fi
        done
    fi

    # .ports.env must have all port assignments
    if [[ -f ".ports.env" ]]; then
        for var in BACKEND_PORT FRONTEND_PORT HEALTH_PORT AUTH_PORT; do
            if ! grep -q "$var" ".ports.env"; then
                print_warning ".ports.env is missing $var"
                errors=$((errors + 1))
            fi
        done
    fi

    if [[ $errors -gt 0 ]]; then
        print_warning "$errors env validation warning(s) found — services may not start correctly"
    else
        print_success "All required environment variables validated"
    fi
}

###############################################################################
# Main Deployment Functions
###############################################################################

deploy_local() {
    print_info "Deploying LOCAL environment..."

    # Ensure .ports.env exists before docker compose reads it
    ensure_ports_env

    # Use base docker-compose.yml and local override
    docker-compose -f docker-compose.yml -f docker-compose.local.yml $COMMAND $EXTRA_ARGS
    
    if [[ "$COMMAND" == "up" ]]; then
        echo ""
        print_success "Local environment started!"
        print_info "Access your services at:"
        echo "  - Frontend:  http://localhost:3000"
        echo "  - Backend:   http://localhost:8080"
        echo "  - MongoDB:   mongodb://localhost:27017"
        echo ""
        print_info "View logs: ./deploy.sh local logs"
        print_info "Stop:      ./deploy.sh local down"
    fi
}

deploy_production() {
    print_info "Deploying PRODUCTION environment..."

    # Ensure .ports.env exists before docker compose reads it
    ensure_ports_env

    # Use both base and production override
    docker-compose -f docker-compose.yml -f docker-compose.prod.yml $COMMAND $EXTRA_ARGS
    
    if [[ "$COMMAND" == "up" ]]; then
        echo ""
        print_success "Production environment started!"
        print_warning "IMPORTANT: Ensure you have:"
        echo "  1. Updated .env.production files with real credentials"
        echo "  2. Configured your domain DNS to point to this server"
        echo "  3. Set up SSL certificates (Traefik will auto-provision Let's Encrypt)"
        echo "  4. Configured firewall rules (ports 80, 443)"
        echo ""
        print_info "Monitor: ./deploy.sh production logs -f"
        print_info "Stop:    ./deploy.sh production down"
    fi
}

deploy_preview() {
    print_info "Deploying PREVIEW environment..."

    # Ensure .ports.env exists before docker compose reads it
    ensure_ports_env

    # Use base + preview override
    docker-compose -f docker-compose.yml -f docker-compose.preview.yml $COMMAND $EXTRA_ARGS

    if [[ "$COMMAND" == "up" ]]; then
        echo ""
        print_success "Preview environment started!"
        print_info "Access your services at:"
        echo "  - Frontend:  http://localhost (via Nginx)"
        echo "  - Backend:   http://localhost:8080"
        echo ""
        print_info "View logs: ./deploy.sh preview logs"
        print_info "Stop:      ./deploy.sh preview down"
    fi
}

show_status() {
    print_info "Container Status:"
    if [[ "$ENV" == "local" ]]; then
        docker-compose -f docker-compose.yml -f docker-compose.local.yml ps
    elif [[ "$ENV" == "preview" ]]; then
        docker-compose -f docker-compose.yml -f docker-compose.preview.yml ps
    else
        docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps
    fi
}

show_logs() {
    local service="${EXTRA_ARGS}"
    
    local compose_files
    if [[ "$ENV" == "local" ]]; then
        compose_files="-f docker-compose.yml -f docker-compose.local.yml"
    elif [[ "$ENV" == "preview" ]]; then
        compose_files="-f docker-compose.yml -f docker-compose.preview.yml"
    else
        compose_files="-f docker-compose.yml -f docker-compose.prod.yml"
    fi

    if [[ -n "$service" ]]; then
        docker-compose $compose_files logs -f $service
    else
        docker-compose $compose_files logs -f
    fi
}

health_check() {
    print_info "Running health checks..."
    
    local services=(
        "http://localhost:8080/readyz:Backend"
        "http://localhost:3000:Frontend"
        "http://localhost:8090/health:Billing"
        "http://localhost:8094/health:Notification"
    )
    
    for service in "${services[@]}"; do
        IFS=':' read -r url name <<< "$service"
        if curl -f -s -o /dev/null "$url"; then
            print_success "$name is healthy"
        else
            print_error "$name is not responding"
        fi
    done
}

backup_database() {
    print_info "Creating MongoDB backup for $ENV..."
    
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_dir="./backups/$ENV/$timestamp"
    
    mkdir -p "$backup_dir"
    
    docker-compose exec -T mongodb mongodump \
        --out=/backup \
        --gzip
    
    docker cp motherboard-mongodb:/backup "$backup_dir"
    
    print_success "Backup created at: $backup_dir"
}

###############################################################################
# Main Script
###############################################################################

print_banner

# Validate environment
validate_env

# Check requirements
check_requirements

# Handle special commands
case "$COMMAND" in
    status)
        show_status
        exit 0
        ;;
    health)
        health_check
        exit 0
        ;;
    backup)
        backup_database
        exit 0
        ;;
    setup)
        bootstrap_config
        print_success "Bootstrap complete. Run './deploy.sh $ENV up' to start all services."
        exit 0
        ;;
    build)
        bootstrap_config
        build_images
        exit 0
        ;;
    logs)
        show_logs
        exit 0
        ;;
esac

# Bootstrap: seed MongoDB and generate per-service env files
bootstrap_config

# Deploy based on environment
print_info "Environment: $ENV"
print_info "Command: $COMMAND $EXTRA_ARGS"
echo ""

if [[ "$ENV" == "local" ]]; then
    deploy_local
elif [[ "$ENV" == "preview" ]]; then
    deploy_preview
else
    deploy_production
fi

exit 0
