#!/bin/bash

# Database Migration Helper Script
# Usage: ./scripts/migrate.sh [command] [args]

set -e

MIGRATIONS_DIR="${MIGRATIONS_DIR:-migrations/sql}"
DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/motherboard?sslmode=disable}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_usage() {
    echo "Usage: $0 [command] [args]"
    echo ""
    echo "Commands:"
    echo "  up              Run all pending migrations"
    echo "  down [N]        Rollback N migrations (default: 1)"
    echo "  goto VERSION    Migrate to specific version"
    echo "  force VERSION   Force set version without running migrations"
    echo "  version         Show current migration version"
    echo "  create NAME     Create new migration files"
    echo ""
    echo "Environment Variables:"
    echo "  DATABASE_URL    PostgreSQL connection string"
    echo "  MIGRATIONS_DIR  Path to migrations directory (default: migrations/sql)"
}

command_up() {
    echo -e "${GREEN}Running migrations...${NC}"
    migrate -path "$MIGRATIONS_DIR" -database "$DATABASE_URL" up
    echo -e "${GREEN}✅ Migrations completed${NC}"
}

command_down() {
    local steps="${1:-1}"
    echo -e "${YELLOW}Rolling back $steps migration(s)...${NC}"
    migrate -path "$MIGRATIONS_DIR" -database "$DATABASE_URL" down "$steps"
    echo -e "${GREEN}✅ Rollback completed${NC}"
}

command_goto() {
    local version="$1"
    if [ -z "$version" ]; then
        echo -e "${RED}Error: Version required${NC}"
        exit 1
    fi
    echo -e "${GREEN}Migrating to version $version...${NC}"
    migrate -path "$MIGRATIONS_DIR" -database "$DATABASE_URL" goto "$version"
    echo -e "${GREEN}✅ Migration to version $version completed${NC}"
}

command_force() {
    local version="$1"
    if [ -z "$version" ]; then
        echo -e "${RED}Error: Version required${NC}"
        exit 1
    fi
    echo -e "${YELLOW}⚠️  Forcing version to $version (use with caution!)${NC}"
    migrate -path "$MIGRATIONS_DIR" -database "$DATABASE_URL" force "$version"
    echo -e "${GREEN}✅ Version forced to $version${NC}"
}

command_version() {
    echo -e "${GREEN}Current migration version:${NC}"
    migrate -path "$MIGRATIONS_DIR" -database "$DATABASE_URL" version
}

command_create() {
    local name="$1"
    if [ -z "$name" ]; then
        echo -e "${RED}Error: Migration name required${NC}"
        exit 1
    fi
    
    # Get next version number
    local next_version=$(ls -1 "$MIGRATIONS_DIR" | grep -E '^[0-9]+_' | sed 's/_.*//' | sort -n | tail -1)
    next_version=$((next_version + 1))
    next_version=$(printf "%03d" "$next_version")
    
    local up_file="$MIGRATIONS_DIR/${next_version}_${name}.up.sql"
    local down_file="$MIGRATIONS_DIR/${next_version}_${name}.down.sql"
    
    echo "-- Add migration SQL here" > "$up_file"
    echo "-- Add rollback SQL here" > "$down_file"
    
    echo -e "${GREEN}✅ Created migration files:${NC}"
    echo "  $up_file"
    echo "  $down_file"
}

# Main command dispatcher
COMMAND="${1:-}"

case "$COMMAND" in
    up)
        command_up
        ;;
    down)
        command_down "${2:-1}"
        ;;
    goto)
        command_goto "$2"
        ;;
    force)
        command_force "$2"
        ;;
    version)
        command_version
        ;;
    create)
        command_create "$2"
        ;;
    help|--help|-h)
        print_usage
        ;;
    *)
        echo -e "${RED}Error: Unknown command '$COMMAND'${NC}"
        echo ""
        print_usage
        exit 1
        ;;
esac
