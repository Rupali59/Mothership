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
    if [[ "$ENV" != "local" && "$ENV" != "production" ]]; then
        print_error "Invalid environment: $ENV"
        echo "Usage: ./deploy.sh [local|production] [command]"
        exit 1
    fi
}

check_env_files() {
    print_info "Checking environment files for $ENV..."
    
    local missing_files=()
    
    # Core services
    if [[ ! -f "./apps/core-server/.env.$ENV" ]]; then
        missing_files+=("./apps/core-server/.env.$ENV")
    fi
    
    if [[ ! -f "./apps/admin-dashboard/.env.$ENV" ]]; then
        missing_files+=("./apps/admin-dashboard/.env.$ENV")
    fi
    
    if [[ ${#missing_files[@]} -gt 0 ]]; then
        print_warning "Missing environment files:"
        for file in "${missing_files[@]}"; do
            echo "  - $file"
        done
        print_info "Creating from .env.example files..."
        
        # Create missing files from examples if they exist
        for file in "${missing_files[@]}"; do
            local example_file="${file%.env.*}/.env.example"
            if [[ -f "$example_file" ]]; then
                cp "$example_file" "$file"
                print_success "Created $file from $example_file"
                print_warning "Please update $file with your actual values!"
            fi
        done
    else
        print_success "All environment files present"
    fi
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

###############################################################################
# Main Deployment Functions
###############################################################################

deploy_local() {
    print_info "Deploying LOCAL environment..."
    
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

show_status() {
    print_info "Container Status:"
    if [[ "$ENV" == "local" ]]; then
        docker-compose -f docker-compose.yml -f docker-compose.local.yml ps
    else
        docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps
    fi
}

show_logs() {
    local service="${EXTRA_ARGS}"
    
    if [[ "$ENV" == "local" ]]; then
        if [[ -n "$service" ]]; then
            docker-compose -f docker-compose.yml -f docker-compose.local.yml logs -f $service
        else
            docker-compose -f docker-compose.yml -f docker-compose.local.yml logs -f
        fi
    else
        if [[ -n "$service" ]]; then
            docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f $service
        else
            docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f
        fi
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
    build)
        check_env_files
        build_images
        exit 0
        ;;
    logs)
        show_logs
        exit 0
        ;;
esac

# Check environment files
check_env_files

# Deploy based on environment
print_info "Environment: $ENV"
print_info "Command: $COMMAND $EXTRA_ARGS"
echo ""

if [[ "$ENV" == "local" ]]; then
    deploy_local
else
    deploy_production
fi

exit 0
