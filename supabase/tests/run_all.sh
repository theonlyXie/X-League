#!/usr/bin/env bash
# Rebuild the test database and run every suite.
#
#   supabase/tests/run_all.sh
#
# Each probe is independent and reseeds what it needs, but they share one
# database, so the bootstrap runs first and the shell suite last — it is the
# only one that commits rather than rolling back.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
export PGHOST="${PGHOST:-/tmp/pgsock}"
PORT="${PGPORT:-5433}"
USER="${PGUSER:-postgres}"

bold() { printf '\n\033[1m%s\033[0m\n' "$1"; }

"$HERE/bootstrap.sh" >/dev/null 2>&1 || { echo "bootstrap failed"; exit 1; }

total_pass=0; total_fail=0

for probe in access_probe rbac_probe auth_probe card_probe squad_probe match_probe \
             cancellation_probe messaging_probe tournament_probe owner_admin_probe \
             club_probe club_entry_probe honours_probe referee_probe; do
  bold "$probe"
  out="$(psql -h "$PGHOST" -p "$PORT" -U "$USER" -q -f "$HERE/$probe.sql" 2>&1)"
  p=$(printf '%s' "$out" | grep -c '| PASS')
  f=$(printf '%s' "$out" | grep -c '| FAIL')
  err=$(printf '%s' "$out" | grep -c '^ERROR\|^psql:.*ERROR')
  if [ "$err" -gt 0 ]; then
    printf '%s\n' "$out" | grep -A2 'ERROR' | head -12
    total_fail=$((total_fail + 1))
  fi
  [ "$f" -gt 0 ] && printf '%s\n' "$out" | grep '| FAIL'
  printf '  %d passed, %d failed\n' "$p" "$f"
  total_pass=$((total_pass + p)); total_fail=$((total_fail + f))
done

bold "booking_spine_test"
out="$(bash "$HERE/booking_spine_test.sh" 2>&1)"
p=$(printf '%s' "$out" | grep -c 'PASS')
f=$(printf '%s' "$out" | grep -c 'FAIL')
[ "$f" -gt 0 ] && printf '%s\n' "$out" | grep 'FAIL'
printf '  %d passed, %d failed\n' "$p" "$f"
total_pass=$((total_pass + p)); total_fail=$((total_fail + f))

bold "total"
printf '  %d passed, %d failed\n\n' "$total_pass" "$total_fail"
[ "$total_fail" -eq 0 ]
