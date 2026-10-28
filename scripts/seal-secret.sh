#!/usr/bin/env bash
set -euo pipefail

: "${POSTGRES_USER:?Set POSTGRES_USER}"
: "${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD}"
: "${POSTGRES_DB:?Set POSTGRES_DB}"
: "${REDIS_PASSWORD:?Set REDIS_PASSWORD}"

OUT="${1:-deploy/chart/templates/taskflow-sealed-secret.yaml}"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

kubeseal --fetch-cert > /tmp/taskflow-sealed-secrets-cert.pem
kubectl create secret generic taskflow-secrets \
  -n taskflow \
  --from-literal=POSTGRES_USER="$POSTGRES_USER" \
  --from-literal=POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  --from-literal=POSTGRES_DB="$POSTGRES_DB" \
  --from-literal=DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@taskflow-postgres:5432/${POSTGRES_DB}" \
  --from-literal=REDIS_PASSWORD="$REDIS_PASSWORD" \
  --from-literal=REDIS_URL="redis://:${REDIS_PASSWORD}@taskflow-redis:6379" \
  --dry-run=client -o yaml > "$TMP"

kubeseal --cert /tmp/taskflow-sealed-secrets-cert.pem \
  --format yaml < "$TMP" > "$OUT"

echo "Created encrypted SealedSecret: $OUT"
echo "Review it, commit the encrypted manifest, and never commit the plaintext values."
