#!/bin/bash
# FORGE Deployment Script
# Usage: ./scripts/deploy.sh <project> <target>
#
# Examples:
#   ./scripts/deploy.sh endeavor user@server.com
#   ./scripts/deploy.sh helpdesk user@192.168.1.100

set -e

PROJECT=${1:-endeavor}
TARGET=${2:-}

if [ -z "$TARGET" ]; then
    echo "Usage: $0 <project> <user@host>"
    echo "Example: $0 endeavor user@server.com"
    exit 1
fi

PROJECT_DIR="projects/$PROJECT"

if [ ! -d "$PROJECT_DIR" ]; then
    echo "Error: Project directory $PROJECT_DIR not found"
    exit 1
fi

echo "=== FORGE Deployment ==="
echo "Project: $PROJECT"
echo "Target: $TARGET"
echo ""

# Step 1: Build forge CLI if needed
echo ">>> Building forge CLI..."
if [ ! -f "./bin/forge" ]; then
    (cd runtime && go build -o ../bin/forge ./cmd/forge)
fi

# Step 2: Build the FORGE app
echo ">>> Building FORGE app..."
(cd "$PROJECT_DIR" && ../../bin/forge build)

# Step 3: Build frontend if it exists
if [ -d "$PROJECT_DIR/web" ]; then
    echo ">>> Building frontend..."
    (cd "$PROJECT_DIR/web" && npm ci && npm run build)
fi

# Step 4: Create deployment package
echo ">>> Creating deployment package..."
DEPLOY_DIR=$(mktemp -d)
mkdir -p "$DEPLOY_DIR/$PROJECT"

# Copy artifacts
cp ./bin/forge "$DEPLOY_DIR/$PROJECT/"
cp -r "$PROJECT_DIR/.forge-runtime" "$DEPLOY_DIR/$PROJECT/"
[ -f "$PROJECT_DIR/forge.runtime.toml" ] && cp "$PROJECT_DIR/forge.runtime.toml" "$DEPLOY_DIR/$PROJECT/"
[ -d "$PROJECT_DIR/web/dist" ] && cp -r "$PROJECT_DIR/web/dist" "$DEPLOY_DIR/$PROJECT/web/"

# Create start script
cat > "$DEPLOY_DIR/$PROJECT/start.sh" << 'EOF'
#!/bin/bash
set -e

# Load environment from .env if it exists
[ -f .env ] && export $(cat .env | xargs)

# Required environment variables
: ${DATABASE_URL:?DATABASE_URL is required}
: ${JWT_SECRET:?JWT_SECRET is required}

export FORGE_ENV=production

# Apply migrations
./forge migrate -apply

# Start server
exec ./forge run -port ${PORT:-8080}
EOF
chmod +x "$DEPLOY_DIR/$PROJECT/start.sh"

# Create example .env
cat > "$DEPLOY_DIR/$PROJECT/.env.example" << EOF
FORGE_ENV=production
DATABASE_URL=postgres://user:password@localhost:5432/$PROJECT
JWT_SECRET=$(openssl rand -hex 32)
PORT=8080
EOF

# Step 5: Deploy to target
echo ">>> Deploying to $TARGET..."
ssh "$TARGET" "mkdir -p /opt/$PROJECT"
rsync -avz --delete "$DEPLOY_DIR/$PROJECT/" "$TARGET:/opt/$PROJECT/"

# Cleanup
rm -rf "$DEPLOY_DIR"

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Next steps on $TARGET:"
echo "  1. cd /opt/$PROJECT"
echo "  2. cp .env.example .env"
echo "  3. Edit .env with production values"
echo "  4. ./start.sh"
echo ""
echo "Or with systemd:"
echo "  sudo cp /opt/$PROJECT/$PROJECT.service /etc/systemd/system/"
echo "  sudo systemctl enable $PROJECT"
echo "  sudo systemctl start $PROJECT"
