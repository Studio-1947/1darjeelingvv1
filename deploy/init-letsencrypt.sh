#!/usr/bin/env bash
# One-time bootstrap: brings the stack up over plain HTTP, obtains the first
# real Let's Encrypt certificate via the webroot challenge, then switches
# nginx over to the HTTPS config. Safe to re-run — skips issuance if a
# certificate for the domain already exists.
#
# Usage: ./deploy/init-letsencrypt.sh
# Run from the repo root, on the VPS, after populating .env (see
# .env.production.example).

set -euo pipefail

DOMAIN="onedarjeeling.duckdns.org"
EMAIL="${CERTBOT_EMAIL:?Set CERTBOT_EMAIL in your shell or .env before running this script}"
COMPOSE="docker compose -f docker-compose.prod.yml"

cd "$(dirname "$0")/.."

mkdir -p deploy/nginx/conf.d deploy/certbot/conf deploy/certbot/www

if [ -d "deploy/certbot/conf/live/$DOMAIN" ]; then
  echo "Certificate for $DOMAIN already exists — skipping issuance, just (re)starting the stack."
  cp deploy/nginx/app.conf deploy/nginx/conf.d/app.conf
  $COMPOSE up -d --build
  exit 0
fi

echo "==> Starting stack with a temporary HTTP-only nginx config..."
cp deploy/nginx/app-bootstrap.conf deploy/nginx/conf.d/app.conf
$COMPOSE up -d --build postgres backend nginx

echo "==> Waiting for nginx to answer on port 80..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost/api" > /dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "==> Requesting certificate for $DOMAIN..."
$COMPOSE run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    -d $DOMAIN \
    --email $EMAIL --agree-tos --no-eff-email" certbot

echo "==> Switching nginx to the HTTPS config..."
cp deploy/nginx/app.conf deploy/nginx/conf.d/app.conf
$COMPOSE exec nginx nginx -s reload

echo "==> Starting the certbot renewal loop..."
$COMPOSE up -d certbot

echo "==> Done. https://$DOMAIN should now be live."
