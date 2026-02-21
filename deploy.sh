#!/bin/bash

###############################################################################
# Motherboard Deployment Script
# Usage: ./deploy.sh [local|production] [command]
#
# Local debug variant: ./deploy.sh local debug up
#   Adds docker-compose.local.debug.yml for Delve (backend) and Node inspect (frontend).
#
# Examples:
#   ./deploy.sh local up          # Start local environment (core compose if chaukidar/scheduler absent)
#   ./deploy.sh local debug up    # Start local with debugging (attach from VS Code)
#   ./deploy.sh local clean       # Stop services, remove orphans, prune dangling images
#   ./deploy.sh production up -d  # Start production in background
#   ./deploy.sh production down   # Stop production
#   ./deploy.sh production logs   # View logs
#
# Note: For chaukidar and scheduler services, run ./scripts/setup-repos.sh first.
# When absent, deploy uses docker-compose.core.yml (redis, mongodb, minio, auth, health, backend, frontend only).
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
DEBUG_MODE=0

# Parse "local debug up" -> ENV=local, COMMAND=up, DEBUG_MODE=1
if [[ "$ENV" == "local" && "$COMMAND" == "debug" ]]; then
    DEBUG_MODE=1
    COMMAND=${3:-up}
    EXTRA_ARGS="${@:4}"
fi

# Remove orphan containers (leftovers from old compose setup)
[[ "$COMMAND" == "up" || "$COMMAND" == "down" ]] && EXTRA_ARGS="$EXTRA_ARGS --remove-orphans"

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
    if [[ "$ENV" != "local" && "$ENV" != "local-mono" && "$ENV" != "preview" && "$ENV" != "production" ]]; then
        print_error "Invalid environment: $ENV"
        echo "Usage: ./deploy.sh [local|local-mono|preview|production] [command]"
        exit 1
    fi
}

# check_go returns 0 if Go toolchain is available.
check_go() {
    command -v go &> /dev/null
}

# wait_for_mongodb polls until the MongoDB container reports healthy or times out.
wait_for_mongodb() {
    local max_wait=120
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

# wait_for_services polls backend and frontend after compose up -d.
wait_for_services() {
    local max_wait=60
    local elapsed=0
    printf "  Verifying backend and frontend"
    while [ $elapsed -lt $max_wait ]; do
        local backend_ok=0
        local frontend_ok=0
        curl -sf -o /dev/null http://localhost:8080/readyz 2>/dev/null && backend_ok=1
        curl -sf -o /dev/null http://localhost:3000 2>/dev/null && frontend_ok=1
        if [[ $backend_ok -eq 1 && $frontend_ok -eq 1 ]]; then
            echo ""
            print_success "Frontend and backend are healthy"
            return 0
        fi
        sleep 3
        elapsed=$((elapsed + 3))
        printf "."
    done
    echo ""
    print_warning "Backend or frontend not ready within ${max_wait}s — check logs: ./deploy.sh local logs"
    return 1
}

# bootstrap_config seeds MongoDB and generates per-service env files.
#
#   Phase 1  — start infra only (mongodb, redis, minio) and wait for healthy
#   Phase 2  — seed entity_configs.json into MongoDB (cmd/seed-config)
#   Phase 2b — sync ports.json into MongoDB (cmd/port-registry sync)
#   Phase 2c — generate .config/global/.ports.env from ports.json (cmd/gen-ports-env)
#   Phase 3  — write per-service .env.$ENV files from MongoDB (cmd/gen-env --force)
#   Phase 4  — validate required env vars exist in generated files
#
bootstrap_config() {
    print_info "Phase 1 — Starting infrastructure services..."
    if [[ "$ENV" == "local" ]]; then
        local cf
        cf=$(get_local_compose_files)
        docker-compose $cf up mongodb redis minio -d
    elif [[ "$ENV" == "local-mono" ]]; then
         docker-compose -f docker-compose.dev.yml up mongodb redis minio -d
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
    local seed_attempts=3
    local seed_attempt=1
    while ! MONGODB_URI=mongodb://localhost:27017 go run ./cmd/seed-config; do
        if [ $seed_attempt -ge $seed_attempts ]; then
            print_error "seed-config failed after $seed_attempts attempts — check MongoDB and seeds/data/global/entity_configs.json"
            exit 1
        fi
        print_warning "seed-config attempt $seed_attempt failed, retrying in 3s..."
        sleep 3
        seed_attempt=$((seed_attempt + 1))
    done
    print_success "Entity configs seeded"

    print_info "Phase 2b — Syncing port registry into MongoDB..."
    MONGODB_URI=mongodb://localhost:27017 go run ./cmd/port-registry sync || {
        print_error "port-registry sync failed"
        exit 1
    }
    print_success "Port registry synced"

    print_info "Phase 2c — Generating .config/global/.ports.env from ports.json..."
    mkdir -p .config/global
    go run ./cmd/gen-ports-env || {
        print_error "gen-ports-env failed"
        exit 1
    }
    print_success ".config/global/.ports.env generated"

    print_info "Phase 2d — Validating docker-compose config..."
    if docker compose config --quiet 2>/dev/null; then
        print_success "Docker Compose config is valid"
    else
        print_warning "Docker Compose config validation failed — .config/global/.ports.env vars may not resolve. Continuing anyway."
    fi

    print_info "Phase 3 — Generating per-service .env.$ENV files from MongoDB..."
    local config_env="$ENV"
    # Map local-mono to local config
    if [[ "$ENV" == "local-mono" ]]; then config_env="local"; fi

    local genenv_attempts=3
    local genenv_attempt=1
    while ! MONGODB_URI=mongodb://localhost:27017 go run ./cmd/gen-env --env "$config_env" --force; do
        if [ $genenv_attempt -ge $genenv_attempts ]; then
            print_error "gen-env failed after $genenv_attempts attempts — run: MONGODB_URI=mongodb://localhost:27017 go run ./cmd/gen-env --dry-run"
            exit 1
        fi
        print_warning "gen-env attempt $genenv_attempt failed, retrying in 3s..."
        sleep 3
        genenv_attempt=$((genenv_attempt + 1))
    done
    print_success "Environment files generated (.env.$ENV per service)"

    if [[ "$ENV" == "local-mono" ]]; then
        print_info "Consolidating environment variables for monolith..."
        # Standardize log directory
        mkdir -p apps/logs services/logs plugins/logs logs 2>/dev/null
        
        # Create a single env file for all services
        # Order matters: last one wins. We want core-server to provide the baseline.
        
        # 1. Collect everything, filter out PORT (supervisord handles this)
        local tmp_env=".env.monolith.tmp"
        rm -f "$tmp_env"
        
        # Append all .env.local files
        for f in apps/motherboard/*/.env.local services/*/.env.local plugins/*/.env.local; do
            if [[ -f "$f" ]]; then
                grep -v "^PORT=" "$f" >> "$tmp_env"
            fi
        done
        
        # 2. Prefer core-server values for overlapping keys (it usually has the most accurate one for local-mono)
        if [[ -f "apps/motherboard/backend/.env.local" ]]; then
            grep -v "^PORT=" "apps/motherboard/backend/.env.local" >> "$tmp_env"
        fi

        # 3. Final consolidation: unique keys, preferring the last one added
        # We use awk to keep only the last occurrence of each key
        awk -F= '!/^#/ && NF>=2 {vars[$1]=$0} END {for (v in vars) print vars[v]}' "$tmp_env" | sort > .env.monolith
        rm -f "$tmp_env"

        # 4. Inject local-mono fallbacks and URL overrides for internal service communication
        {
            # Core Service URLs - point to localhost in monolith
            echo "API_URL=http://localhost:8080"
            echo "BACKEND_URL=http://localhost:8080"
            echo "MOTHERBOARD_API_URL=http://localhost:8080"
            echo "HEALTH_SERVICE_URL=http://localhost:8091"
            echo "AUTH_SERVICE_URL=http://localhost:8088"
            echo "BILLING_SERVICE_URL=http://localhost:8090"
            echo "ENTITLEMENT_SERVICE_URL=http://localhost:8085"
            echo "SCHEDULER_URL=http://localhost:8089"
            echo "NOTIFICATION_SERVICE_URL=http://localhost:8094"
            echo "MARKETING_SERVICE_URL=http://localhost:8092"
            echo "CLOUD_ADAPTER_URL=http://localhost:8093"
            echo "STORAGE_SERVICE_URL=http://localhost:8098"
            
            # Plugin Service URLs
            echo "EMAIL_PLUGIN_URL=http://localhost:8081"
            echo "SMS_PLUGIN_URL=http://localhost:8082"
            echo "WHATSAPP_PLUGIN_URL=http://localhost:8083"
            echo "TELEGRAM_PLUGIN_URL=http://localhost:8084"
            echo "RAZORPAY_PLUGIN_URL=http://localhost:8086"
            echo "STRIPE_PLUGIN_URL=http://localhost:8087"
            echo "INVENTORY_SERVICE_URL=http://localhost:8096"
            echo "JHORA_SERVICE_URL=http://localhost:3130"
            echo "VEDIKA_SERVICE_URL=http://localhost:3140"

            # Fallback credentials and flags
            echo "API_KEY=local-dev-key"
            echo "AUTH_SECRET=local-auth-secret"
            echo "EMAIL_PROVIDER=noop"
            echo "RESEND_API_KEY=re_123"
            echo "SMS_PROVIDER=twilio"
            echo "SMS_TWILIO_ACCOUNT_SID=AC123"
            echo "WHATSAPP_PROVIDER=twilio"
            echo "WHATSAPP_TWILIO_SID=AC123"
            echo "ENCRYPTION_KEY=12345678901234567890123456789012"
            echo "ENABLE_HEALTH_EMITTER=true"
        } >> .env.monolith
        
        print_success ".env.monolith generated"
    fi

    print_info "Phase 4 — Validating required environment variables..."
    validate_env_files
}

build_images() {
    print_info "Building Docker images for $ENV environment..."
    
    if [[ "$ENV" == "local" ]]; then
        local cf
        cf=$(get_local_compose_files)
        docker-compose $cf build
    elif [[ "$ENV" == "local-mono" ]]; then
        docker-compose -f docker-compose.dev.yml build
    else
        docker-compose -f docker-compose.yml -f docker-compose.prod.yml build
    fi
    
    print_success "Images built successfully"
}

# ensure_ports_env generates .config/global/.ports.env if it doesn't exist.
# This guards against running `docker compose up` directly without deploy.sh.
ensure_ports_env() {
    if [[ ! -f ".config/global/.ports.env" ]]; then
        print_warning ".config/global/.ports.env not found — generating from ports.json..."
        if check_go; then
            go run ./cmd/gen-ports-env || {
                print_error "Failed to generate .config/global/.ports.env — run: go run ./cmd/gen-ports-env"
                exit 1
            }
            print_success ".config/global/.ports.env generated"
        else
            print_error ".config/global/.ports.env is missing and Go is not installed to generate it."
            print_error "Either install Go or manually create .config/global/.ports.env"
            exit 1
        fi
    fi
}

# validate_env_files checks that critical env vars are present in generated files.
validate_env_files() {
    local errors=0

    # Frontend must have HEALTH_SERVICE_URL
    # Frontend must have HEALTH_SERVICE_URL
    local env_suffix="$ENV"
    if [[ "$ENV" == "local-mono" ]]; then env_suffix="local"; fi

    if [[ -f "apps/motherboard/frontend/.env.$env_suffix" ]]; then
        if ! grep -q "HEALTH_SERVICE_URL" "apps/motherboard/frontend/.env.$env_suffix"; then
            print_warning "apps/motherboard/frontend/.env.$env_suffix is missing HEALTH_SERVICE_URL"
            errors=$((errors + 1))
        fi
    fi

    # Backend must have service URLs
    local backend_env="apps/motherboard/backend/.env.$env_suffix"
    [[ ! -f "$backend_env" ]] && backend_env="apps/motherboard/backend/.env.local"
    if [[ -f "$backend_env" ]]; then
        for var in HEALTH_SERVICE_URL AUTH_SERVICE_URL BILLING_SERVICE_URL; do
            if ! grep -q "$var" "$backend_env"; then
                print_warning "$backend_env is missing $var"
                errors=$((errors + 1))
            fi
        done
    fi

    # .config/global/.ports.env must have all port assignments
    if [[ -f ".config/global/.ports.env" ]]; then
        for var in BACKEND_PORT FRONTEND_PORT HEALTH_PORT AUTH_PORT; do
            if ! grep -q "$var" ".config/global/.ports.env"; then
                print_warning ".config/global/.ports.env is missing $var"
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

# get_local_compose_files returns compose file flags for local deployment.
# Uses core compose when chaukidar/scheduler Dockerfiles are absent.
get_local_compose_files() {
    local cf
    if [[ ! -f "services/chaukidar/Dockerfile" ]] || [[ ! -f "services/scheduler/Dockerfile" ]]; then
        cf="-f docker-compose.core.yml -f docker-compose.core.local.yml"
        [[ "${1:-}" == "verbose" ]] && print_info "Using core compose (chaukidar/scheduler absent)" >&2
    else
        cf="-f docker-compose.yml -f docker-compose.local.yml"
    fi
    [[ $DEBUG_MODE -eq 1 ]] && cf="$cf -f docker-compose.local.debug.yml"
    echo "$cf"
}

deploy_local() {
    print_info "Deploying LOCAL environment..."
    [[ $DEBUG_MODE -eq 1 ]] && print_info "Debug mode: Delve (2345) and Node inspect (9230) enabled"

    # Ensure .config/global/.ports.env exists before docker compose reads it
    ensure_ports_env

    # Config pre-up check: when using core, verify backend/frontend .env.local exist
    local compose_files
    compose_files=$(get_local_compose_files verbose)
    if echo "$compose_files" | grep -q "docker-compose.core"; then
        for f in apps/motherboard/backend/.env.local apps/motherboard/frontend/.env.local; do
            if [[ ! -f "$f" ]]; then
                print_warning "$f missing — bootstrap should create it. Run ./deploy.sh local setup first."
            fi
        done
    fi

    docker-compose $compose_files $COMMAND $EXTRA_ARGS

    if [[ "$COMMAND" == "up" ]]; then
        echo ""
        print_success "Local environment started!"
        # Post-up health verification when running detached
        if echo " $EXTRA_ARGS " | grep -q " -d "; then
            wait_for_services
        fi
        print_info "Access your services at:"
        echo "  - Frontend:  http://localhost:3000"
        echo "  - Backend:   http://localhost:8080"
        echo "  - MongoDB:   mongodb://localhost:27017"
        [[ $DEBUG_MODE -eq 1 ]] && echo "  - Debug:     Backend Delve :2345, Frontend Node :9230"
        echo ""
        print_info "View logs: ./deploy.sh local logs"
        print_info "Stop:      ./deploy.sh local down"
    fi
}

deploy_local_mono() {
    print_info "Deploying LOCAL MONOLITH environment..."

    ensure_ports_env

    # Use dev compose for monolith
    docker-compose -f docker-compose.dev.yml $COMMAND $EXTRA_ARGS

    if [[ "$COMMAND" == "up" ]]; then
        echo ""
        print_success "Local Monolith environment started!"
        print_info "Access your services at:"
        echo "  - Frontend:  http://localhost:3000"
        echo "  - Backend:   http://localhost:8080"
        echo "  - Dashboard: http://localhost:8080/dashboard (if available)"
        echo ""
        print_info "View logs: ./deploy.sh local-mono logs"
        print_info "Stop:      ./deploy.sh local-mono down"
    fi
}

deploy_production() {
    print_info "Deploying PRODUCTION environment..."

    # Ensure .config/global/.ports.env exists before docker compose reads it
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

    # Ensure .config/global/.ports.env exists before docker compose reads it
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
        local cf
        cf=$(get_local_compose_files)
        docker-compose $cf ps
    elif [[ "$ENV" == "local-mono" ]]; then
        docker-compose -f docker-compose.dev.yml ps
        echo ""
        print_info "Internal Monolith Service Status:"
        docker exec motherboard supervisorctl status 2>/dev/null || print_warning "Monolith container not running or supervisord not ready"
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
        compose_files=$(get_local_compose_files)
    elif [[ "$ENV" == "local-mono" ]]; then
        compose_files="-f docker-compose.dev.yml"
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
    restart)
        print_info "Restarting $ENV environment..."
        print_info "Shutting down existing services..."
        
        # Select compose files based on environment
        COMPOSE_FILES=""
        if [[ "$ENV" == "local" ]]; then
            COMPOSE_FILES=$(get_local_compose_files)
        elif [[ "$ENV" == "local-mono" ]]; then
            COMPOSE_FILES="-f docker-compose.dev.yml"
        elif [[ "$ENV" == "preview" ]]; then
            COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.preview.yml"
        else
            COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.prod.yml"
        fi

        # Gracefully shut down
        docker-compose $COMPOSE_FILES down --remove-orphans || print_warning "Shutdown finished with warnings (this is usually fine if nothing was running)"
        
        print_success "Shutdown complete"
        
        # Switch command to 'up' so that the script proceeds to start everything
        COMMAND="up"
        ;;
    logs)
        show_logs
        exit 0
        ;;
    clean)
        if [[ "$ENV" != "local" ]]; then
            print_error "'clean' command is only supported for local environment"
            exit 1
        fi
        print_info "Stopping local services and removing orphaned containers..."
        compose_files=$(get_local_compose_files)
        docker-compose $compose_files down --remove-orphans || print_warning "Some containers may already be stopped"
        print_info "Pruning dangling images..."
        docker image prune -f
        print_success "Clean complete. Run './deploy.sh local up' to start again."
        exit 0
        ;;
    control)
        if [[ "$ENV" != "local-mono" ]]; then
            print_error "'control' command is only supported in local-mono environment"
            exit 1
        fi
        
        supervisor_cmd="${EXTRA_ARGS%% *}"
        service="${EXTRA_ARGS#* }"
        
        if [[ -z "$supervisor_cmd" ]] || [[ "$supervisor_cmd" == "$service" ]]; then
            print_error "Usage: ./deploy.sh local-mono control <start|stop|restart|status> [service]"
            exit 1
        fi
        
        print_info "Executing monolith control: $supervisor_cmd $service"
        docker exec motherboard supervisorctl $supervisor_cmd $service
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
elif [[ "$ENV" == "local-mono" ]]; then
    deploy_local_mono
elif [[ "$ENV" == "preview" ]]; then
    deploy_preview
else
    deploy_production
fi

exit 0
