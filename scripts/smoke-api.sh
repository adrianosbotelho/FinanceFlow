#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${NEXT_PUBLIC_BASE_URL:-http://localhost:3000}"
YEAR="$(date +%Y)"

echo "Smoke API check em ${BASE_URL}"
curl -fsS "${BASE_URL}/api/investments" >/dev/null
curl -fsS "${BASE_URL}/api/returns" >/dev/null
curl -fsS "${BASE_URL}/api/dashboard?year=${YEAR}" >/dev/null
echo "Smoke API check OK"
