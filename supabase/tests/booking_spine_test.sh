#!/usr/bin/env bash
# Acceptance tests for the booking spine, run against a live Postgres.
# These cover the release gates in §9 that the database is responsible for.
set -uo pipefail

PSQL="psql -h ${PGHOST:-/tmp} -p ${PGPORT:-5433} -U ${PGUSER:-postgres} -v ON_ERROR_STOP=1 -tAqc"
pass=0; fail=0
ok()   { printf '  \033[32mPASS\033[0m %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  \033[31mFAIL\033[0m %s — %s\n' "$1" "$2"; fail=$((fail+1)); }
check(){ [ "$2" = "$3" ] && ok "$1" || bad "$1" "expected '$3', got '$2'"; }

# Reset to the seeded evening so a run never depends on the last one.
SEED="$(dirname "$0")/../seed.sql"
psql -h "${PGHOST:-/tmp}" -p "${PGPORT:-5433}" -U "${PGUSER:-postgres}" -v ON_ERROR_STOP=1 -q -f "$SEED" || {
  echo "could not seed; is the database up?"; exit 1;
}

PITCH=$($PSQL "select p.id from pitch p join venue v on v.id=p.venue_id where v.name='Stadium One' and p.label='Pitch A'")
# Times are resolved by the database in the venue's own zone. Egypt observes
# DST, so a hardcoded offset silently addresses the wrong hour — the client
# has the same obligation and meets it by echoing back the `starts_at` that
# search_availability returned, never by assembling a timestamp itself.
cairo() { $PSQL "select ('2026-08-18 $1:00:00'::timestamp at time zone 'Africa/Cairo')::text"; }
NINE=$(cairo 21)   # the 9 PM slot the design books
SEVEN=$(cairo 19)  # a quiet hour, free in the seed

echo "AC-01 — search returns only saleable slots, priced"
n=$($PSQL "select count(*) from search_availability('$PITCH', date '2026-08-18') where available")
check "three hours are free on Pitch A" "$n" "3"
p=$($PSQL "select price_egp from search_availability('$PITCH', date '2026-08-18') where hour=21")
check "9 PM is priced at EGP 300" "$p" "300"
p=$($PSQL "select price_egp from search_availability('$PITCH', date '2026-08-18') where hour=23")
check "11 PM carries the late-hour price" "$p" "260"

echo
echo "AC-02 — two players reach for the last slot at once"
$PSQL "delete from booking where pitch_id='$PITCH' and during && tstzrange('$NINE'::timestamptz,'$NINE'::timestamptz+interval '1 hour')" >/dev/null
rm -f /tmp/xl_race_*.out
for i in 1 2 3 4 5; do
  ( $PSQL "select ok from hold_slot('$PITCH', '$NINE'::timestamptz, 60, 'Racer $i')" > "/tmp/xl_race_$i.out" 2>&1 ) &
done
wait
wins=$(cat /tmp/xl_race_*.out | grep -c '^t$')
losses=$(cat /tmp/xl_race_*.out | grep -c '^f$')
check "exactly one of five concurrent holds succeeds" "$wins" "1"
check "the other four are refused" "$losses" "4"
rows=$($PSQL "select count(*) from booking where pitch_id='$PITCH' and state='held' and during && tstzrange('$NINE'::timestamptz,'$NINE'::timestamptz+interval '1 hour')")
check "one hold row exists, no overlap created" "$rows" "1"

echo
echo "BKG-011 — the losers are given somewhere else to go"
alts=$($PSQL "select count(*) from nearest_alternatives('$PITCH', '$NINE'::timestamptz)")
[ "$alts" -gt 0 ] && ok "alternatives offered ($alts)" || bad "alternatives offered" "got none"

echo
echo "AC-03 — a hold that runs out returns the slot to inventory"
$PSQL "delete from booking where pitch_id='$PITCH'" >/dev/null
hid=$($PSQL "select booking_id from hold_slot('$PITCH', '$SEVEN'::timestamptz, 60, 'Basel', 2)")
avail=$($PSQL "select available from search_availability('$PITCH', date '2026-08-18') where hour=19")
check "the held hour is not saleable" "$avail" "f"
sleep 3
avail=$($PSQL "select available from search_availability('$PITCH', date '2026-08-18') where hour=19")
check "after expiry the hour is saleable again" "$avail" "t"
st=$($PSQL "select state from booking where id='$hid'")
check "the hold is recorded as expired, not deleted" "$st" "expired"
ev=$($PSQL "select count(*) from booking_event where booking_id='$hid' and to_state='expired'")
check "expiry wrote an audit event" "$ev" "1"

echo
echo "AC-03b — an expired hold cannot be confirmed"
hid=$($PSQL "select booking_id from hold_slot('$PITCH', '$SEVEN'::timestamptz, 60, 'Basel', 2)")
sleep 3
res=$($PSQL "select ok from confirm_booking('$hid')")
check "confirmation is refused" "$res" "f"

echo
echo "BKG-005 — confirming twice yields one booking"
$PSQL "delete from booking where pitch_id='$PITCH'" >/dev/null
hid=$($PSQL "select booking_id from hold_slot('$PITCH', '$NINE'::timestamptz, 60, 'Basel Elsayed')")
c1=$($PSQL "select code from confirm_booking('$hid')")
c2=$($PSQL "select code from confirm_booking('$hid')")
check "the retry returns the original code" "$c2" "$c1"
n=$($PSQL "select count(*) from booking where pitch_id='$PITCH' and state='confirmed'")
check "only one confirmed booking exists" "$n" "1"
[ -n "$c1" ] && ok "a booking code was issued ($c1)" || bad "booking code" "empty"

echo
echo "AC-05 — a phone booking removes the slot from player search"
free_before=$($PSQL "select available from search_availability('$PITCH', date '2026-08-18') where hour=19")
check "7 PM is saleable beforehand" "$free_before" "t"
$PSQL "select ok from record_offline_booking('$PITCH', '$SEVEN'::timestamptz, 60, 'phone', 'Hesham Fouad', 'staff M.A.')" >/dev/null
free_after=$($PSQL "select available from search_availability('$PITCH', date '2026-08-18') where hour=19")
check "7 PM disappears from search" "$free_after" "f"
src=$($PSQL "select taken_by from search_availability('$PITCH', date '2026-08-18') where hour=19")
check "and it is labelled as a phone booking" "$src" "phone"

echo
echo "OWN-006 — staff cannot double-sell either"
res=$($PSQL "select ok from record_offline_booking('$PITCH', '$SEVEN'::timestamptz, 60, 'walk_in', 'Someone else', 'staff M.A.')")
check "a second walk-in on the same hour is refused" "$res" "f"

echo
echo "§5.4 — adjacent hours do not collide"
$PSQL "delete from booking where pitch_id='$PITCH'" >/dev/null
a=$($PSQL "select ok from hold_slot('$PITCH', '2026-08-18 21:00:00+02'::timestamptz, 60, 'A')")
b=$($PSQL "select ok from hold_slot('$PITCH', '2026-08-18 22:00:00+02'::timestamptz, 60, 'B')")
check "9 PM and 10 PM can both be held" "$a$b" "tt"

echo
echo "Releasing a hold gives the slot straight back"
$PSQL "delete from booking where pitch_id='$PITCH'" >/dev/null
hid=$($PSQL "select booking_id from hold_slot('$PITCH', '$NINE'::timestamptz, 60, 'Basel')")
$PSQL "select release_hold('$hid')" >/dev/null
avail=$($PSQL "select available from search_availability('$PITCH', date '2026-08-18') where hour=21")
check "the slot is saleable immediately" "$avail" "t"

echo
echo "BKG-009 — check-in is gated on confirmation"
$PSQL "delete from booking where pitch_id='$PITCH'" >/dev/null
hid=$($PSQL "select booking_id from hold_slot('$PITCH', '$NINE'::timestamptz, 60, 'Basel')")
res=$($PSQL "select ok from check_in_booking('$hid', 'staff M.A.')")
check "a mere hold cannot be checked in" "$res" "f"
$PSQL "select ok from confirm_booking('$hid')" >/dev/null
res=$($PSQL "select ok from check_in_booking('$hid', 'staff M.A.')")
check "a confirmed booking can" "$res" "t"
res=$($PSQL "select ok from check_in_booking('$hid', 'staff M.A.')")
check "and checking in twice is harmless" "$res" "t"

echo
echo "ADM-012 — the booking's whole life is on the record"
n=$($PSQL "select count(*) from booking_event where booking_id='$hid'")
[ "$n" -ge 3 ] && ok "audit trail has $n events" || bad "audit trail" "only $n events"

echo
printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
