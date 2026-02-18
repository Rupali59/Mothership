#!/bin/bash

# setup-repos.sh
# Clones all service repositories into the correct directory structure.
# Usage: ./scripts/setup-repos.sh

set -e

echo "🚀 Initializing Mothership Environment..."

# Function to clone or update a repo
clone_repo() {
    local dir=$1
    local repo_url=$2
    
    if [ -d "$dir" ]; then
        if [ -d "$dir/.git" ]; then
            echo "✅ $dir already exists, pulling latest..."
            cd "$dir"
            git pull origin main || git pull origin master || echo "⚠️ Could not pull $dir"
            cd - > /dev/null
        else
            echo "⚠️ $dir exists but is not a git repo. Skipping."
        fi
    else
        echo "⬇️ Cloning $repo_url into $dir..."
        git clone "$repo_url" "$dir"
    fi
}

# --- Infrastructure ---
# (Current repo is Mothership, so no need to clone itself)

# --- Core Apps ---
clone_repo "apps/core-server" "https://github.com/Rupali59/Motherboard-server.git"
clone_repo "apps/core-frontend" "https://github.com/Rupali59/MotherBoard.git"

# --- Services ---
clone_repo "services/auth" "https://github.com/Rupali59/Motherboard-auth-service.git"
clone_repo "services/billing" "https://github.com/Rupali59/Motherboard-billing-service.git"
clone_repo "services/chaukidar" "https://github.com/Rupali59/Motherboard-chaukidar.git"
clone_repo "services/cloud-adapter" "https://github.com/Rupali59/Motherboard-cloud-adapter.git"
clone_repo "services/entitlement" "https://github.com/Rupali59/Motherboard-entitlement-service.git"
clone_repo "services/health" "https://github.com/Rupali59/Motherboard-health-service.git"
clone_repo "services/inventory-management" "https://github.com/Rupali59/Motherboard-inventory-service.git"
clone_repo "services/marketing" "https://github.com/Rupali59/Motherboard-marketing-service.git"
clone_repo "services/notification" "https://github.com/Rupali59/Motherboard-notification-service.git"
clone_repo "services/scheduler" "https://github.com/Rupali59/Motherboard-scheduler.git"
clone_repo "services/storage" "https://github.com/Rupali59/Motherboard-storage-service.git"

echo "🎉 Mothership environment setup complete!"
echo "👉 Run 'go work sync' to update workspace if needed."
