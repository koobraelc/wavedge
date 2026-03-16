#!/usr/bin/env bash
set -euo pipefail

# Wavedge deployment script
# Usage: ./deploy.sh [domain]
#   domain: your FQDN for SSL (e.g., wavedge.io). Defaults to DOMAIN env var.

DOMAIN="${1:-${DOMAIN:-localhost}}"

echo "==> Deploying Wavedge (domain: $DOMAIN)"

# Ensure .env exists
if [ ! -f .env ]; then
  echo "ERROR: .env file not found. Copy .env.example and fill in your values:"
  echo "  cp .env.example .env"
  exit 1
fi

# Export domain for Caddy
export DOMAIN="$DOMAIN"

# Build and start
echo "==> Building containers..."
docker compose build

echo "==> Starting services..."
docker compose up -d

echo "==> Waiting for health check..."
for i in $(seq 1 30); do
  if docker compose exec -T wavedge wget -qO- http://localhost:3000/health >/dev/null 2>&1; then
    echo "==> Wavedge is healthy!"
    docker compose exec -T wavedge wget -qO- http://localhost:3000/health 2>/dev/null
    echo ""
    echo "==> Deployment complete. Site: https://$DOMAIN"
    exit 0
  fi
  sleep 2
done

echo "WARNING: Health check did not pass within 60s. Check logs:"
echo "  docker compose logs wavedge"
exit 1
