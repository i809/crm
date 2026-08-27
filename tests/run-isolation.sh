#!/usr/bin/env bash
# Run the Phase 0/1 isolation test suite.
# Expects the postgres container running. Exits non-zero on any SQL error.
set -euo pipefail
CONTAINER="${PG_CONTAINER:-rubbertrack-platform-postgres-1}"
DSN="postgresql://app_role:apppass@localhost:5432/rubbertrack"

echo "Running isolation tests (A-E) as app_role against $CONTAINER..."
if ! docker exec -i "$CONTAINER" psql "$DSN" -v ON_ERROR_STOP=1 < tests/isolation.sql > /tmp/iso_out.log 2>&1; then
  cat /tmp/iso_out.log
  echo "❌ Isolation tests FAILED"
  exit 1
fi

# Check expectations
out=$(cat /tmp/iso_out.log)
fail=0
check() { # label, expected, actual
  if [ "$2" != "$3" ]; then echo "❌ $1: expected $2, got $3"; fail=1; else echo "✓ $1: $3"; fi
}
# Parse the count results: the value is the line after the dashes, first token.
getval() { echo "$out" | awk -v label="$1" '$0 ~ label{found=1; next} found && /^---/{getline; print $1; exit}'; }
rt=$(getval "rt_records")
lex=$(getval "lexley_records")
none=$(getval "no_tenant_records")
echo ""
echo "Summary:"
check "A.1 rubbertrack sees 7"      "7" "$rt"
check "B.1 lexley sees 1"            "1" "$lex"
check "C.1 unset tenant sees 0"     "0" "$none"
echo "$out" | grep -q "A.3 OK: cross-tenant insert blocked by RLS" && echo "✓ A.3 cross-tenant INSERT blocked" || { echo "❌ A.3 not blocked"; fail=1; }
echo "$out" | grep -q "rubbertrack" && echo "$out" | grep -q "lexley" && echo "✓ E current_tenant() reflects session" || { echo "❌ E failed"; fail=1; }

if [ "$fail" -ne 0 ]; then echo "❌ Some isolation tests failed"; exit 1; fi
echo ""
echo "✅ All isolation tests passed."
