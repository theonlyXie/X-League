#!/usr/bin/env bash
# Acceptance tests for the booking spine, run against a live Postgres.
# These cover the release gates in §9 that the database is responsible for.
#
#   supabase/tests/bootstrap.sh && supabase/tests/booking_spine_test.sh
#
# Every statement runs as somebody. `auth.uid()` reads the JWT claim PostgREST
# puts on the session, so each connection carries that claim through PGOPTIONS
# rather than the suite calling privileged functions as nobody — which is what
# production does and therefore the only way these results mean anything.
set -uo pipefail

HOST="${PGHOST:-/tmp/pgsock}"
PORT="${PGPORT:-5433}"
USER="${PGUSER:-postgres}"

BASEL='11111111-1111-1111-1111-111111111111'   # a player
SALMA='22222222-2222-2222-2222-222222222222'   # manager at Stadium One
KARIM='33333333-3333-3333-3333-333333333333'   # staff at The Box

ACTOR=''
q() {
  if [ -n "$ACTOR" ]; then
    PGOPTIONS="-c request.jwt.claims={\"sub\":\"$ACTOR\"}" \
      psql -h "$HOST" -p "$PORT" -U "$USER" -v ON_ERROR_STOP=1 -tAqc "$1"
  else
    psql -h "$HOST" -p "$PORT" -U "$USER" -v ON_ERROR_STOP=1 -tAqc "$1"
  fi
}
as() { ACTOR="$1"; }
anon() { ACTOR=''; }

pass=0; fail=0
ok()   { printf '  \033[32mPASS\033[0m %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  \033[31mFAIL\033[0m %s — %s\n' "$1" "$2"; fail=$((fail+1)); }
check(){ [ "$2" = "$3" ] && ok "$1" || bad "$1" "expected '$3', got '$2'"; }

# Reset to the seeded evening so a run never depends on the last one.
HERE="$(dirname "$0")"
psql -h "$HOST" -p "$PORT" -U "$USER" -v ON_ERROR_STOP=1 -q -f "$HERE/../seed.sql" >/dev/null 2>&1 || {
  echo "could not seed; run supabase/tests/bootstrap.sh first"; exit 1;
}
psql -h "$HOST" -p "$PORT" -U "$USER" -v ON_ERROR_STOP=1 -q -f "$HERE/../seed_identities.sql" >/dev/null 2>&1

PITCH=$(q "select p.id from pitch p join venue v on v.id=p.venue_id where v.name='Stadium One' and p.label='Pitch A'")
VENUE=$(q "select venue_id from pitch where id='$PITCH'")

# Times are resolved by the database in the venue's own zone. Egypt observes
# DST, so a hardcoded offset silently addresses the wrong hour — the client
# has the same obligation and meets it by echoing back the `starts_at` that
# search_availability returned, never by assembling a timestamp itself.
# Tomorrow evening throughout: an hour that has already started is no longer
# saleable, so a suite anchored to tonight passes in the morning and fails after
# six. The seed covers today and the next two evenings identically.
cairo() { q "select ((current_date + 1 + interval '$1 hours') at time zone 'Africa/Cairo')::text"; }
NINE=$(cairo 21)   # the 9 PM slot the design books
TEN=$(cairo 22)
SEVEN=$(cairo 19)  # a quiet hour, free in the seed
# Tomorrow evening, for the cases that need a match still ahead of us whatever
# time of day the suite happens to run.
TOMORROW="$NINE"

echo "AC-01 — search returns only saleable slots, priced"
n=$(q "select count(*) from search_availability('$PITCH', current_date + 1) where available")
check "three hours are free on Pitch A" "$n" "3"
p=$(q "select price_egp from search_availability('$PITCH', current_date + 1) where hour=21")
check "9 PM is priced at EGP 300" "$p" "300"
p=$(q "select price_egp from search_availability('$PITCH', current_date + 1) where hour=23")
check "11 PM carries the late-hour price" "$p" "260"

echo
echo "AUTH-001 — inventory is for signed-in people"
anon
r=$(q "select reason from hold_slot('$PITCH', '$SEVEN'::timestamptz, 60)")
check "an anonymous hold is refused with a reason" "$r" "Sign in to hold a slot."
n=$(q "select count(*) from booking where state='held'")
check "and writes nothing" "$n" "0"

echo
echo "AC-02 — two players reach for the last slot at once"
as "$BASEL"
q "delete from booking where pitch_id='$PITCH' and during && tstzrange('$NINE'::timestamptz,'$NINE'::timestamptz+interval '1 hour')" >/dev/null
rm -f /tmp/xl_race_*.out
for i in 1 2 3 4 5; do
  ( q "select ok from hold_slot('$PITCH', '$NINE'::timestamptz, 60, 'Racer $i')" > "/tmp/xl_race_$i.out" 2>&1 ) &
done
wait
wins=$(cat /tmp/xl_race_*.out | grep -c '^t$')
losses=$(cat /tmp/xl_race_*.out | grep -c '^f$')
check "exactly one of five concurrent holds succeeds" "$wins" "1"
check "the other four are refused" "$losses" "4"
rows=$(q "select count(*) from booking where pitch_id='$PITCH' and state='held' and during && tstzrange('$NINE'::timestamptz,'$NINE'::timestamptz+interval '1 hour')")
check "one hold row exists, no overlap created" "$rows" "1"

echo
echo "BKG-011 — the losers are given somewhere else to go"
alts=$(q "select count(*) from nearest_alternatives('$PITCH', '$NINE'::timestamptz)")
[ "$alts" -gt 0 ] && ok "alternatives offered ($alts)" || bad "alternatives offered" "got none"

echo
echo "AC-03 — a hold that runs out returns the slot to inventory"
q "delete from booking where pitch_id='$PITCH'" >/dev/null
hid=$(q "select booking_id from hold_slot('$PITCH', '$SEVEN'::timestamptz, 60, 'Basel', 2)")
avail=$(q "select available from search_availability('$PITCH', current_date + 1) where hour=19")
check "the held hour is not saleable" "$avail" "f"
sleep 3
avail=$(q "select available from search_availability('$PITCH', current_date + 1) where hour=19")
check "after expiry the hour is saleable again" "$avail" "t"
st=$(q "select state from booking where id='$hid'")
check "the hold is recorded as expired, not deleted" "$st" "expired"
ev=$(q "select count(*) from booking_event where booking_id='$hid' and to_state='expired'")
check "expiry wrote an audit event" "$ev" "1"

echo
echo "AC-03b — an expired hold cannot be confirmed"
hid=$(q "select booking_id from hold_slot('$PITCH', '$SEVEN'::timestamptz, 60, 'Basel', 2)")
sleep 3
res=$(q "select ok from confirm_booking('$hid')")
check "confirmation is refused" "$res" "f"

echo
echo "BKG-005 — confirming twice yields one booking"
q "delete from booking where pitch_id='$PITCH'" >/dev/null
hid=$(q "select booking_id from hold_slot('$PITCH', '$NINE'::timestamptz, 60, 'Basel Elsayed')")
c1=$(q "select code from confirm_booking('$hid')")
c2=$(q "select code from confirm_booking('$hid')")
check "the retry returns the original code" "$c2" "$c1"
n=$(q "select count(*) from booking where pitch_id='$PITCH' and state='confirmed'")
check "only one confirmed booking exists" "$n" "1"
[ -n "$c1" ] && ok "a booking code was issued ($c1)" || bad "booking code" "empty"

echo
echo "RBAC-001 — a hold belongs to whoever took it"
as "$KARIM"
res=$(q "select reason from confirm_booking('$hid')")
check "someone else cannot confirm it" "$res" "That hold belongs to someone else."

echo
echo "AC-05 — a phone booking removes the slot from player search"
as "$SALMA"
free_before=$(q "select available from search_availability('$PITCH', current_date + 1) where hour=19")
check "7 PM is saleable beforehand" "$free_before" "t"
q "select ok from record_offline_booking('$PITCH', '$SEVEN'::timestamptz, 60, 'phone', 'Hesham Fouad')" >/dev/null
free_after=$(q "select available from search_availability('$PITCH', current_date + 1) where hour=19")
check "7 PM disappears from search" "$free_after" "f"
src=$(q "select taken_by from search_availability('$PITCH', current_date + 1) where hour=19")
check "and it is labelled as a phone booking" "$src" "phone"

echo
echo "OWN-006 — staff cannot double-sell either"
res=$(q "select ok from record_offline_booking('$PITCH', '$SEVEN'::timestamptz, 60, 'walk_in', 'Someone else')")
check "a second walk-in on the same hour is refused" "$res" "f"

echo
echo "§5.4 — adjacent hours do not collide"
as "$BASEL"
q "delete from booking where pitch_id='$PITCH'" >/dev/null
a=$(q "select ok from hold_slot('$PITCH', '$NINE'::timestamptz, 60, 'A')")
b=$(q "select ok from hold_slot('$PITCH', '$TEN'::timestamptz, 60, 'B')")
check "9 PM and 10 PM can both be held" "$a$b" "tt"

echo
echo "Releasing a hold gives the slot straight back"
q "delete from booking where pitch_id='$PITCH'" >/dev/null
hid=$(q "select booking_id from hold_slot('$PITCH', '$NINE'::timestamptz, 60, 'Basel')")
q "select release_hold('$hid')" >/dev/null
avail=$(q "select available from search_availability('$PITCH', current_date + 1) where hour=21")
check "the slot is saleable immediately" "$avail" "t"

echo
echo "BKG-009 — check-in is gated on confirmation"
q "delete from booking where pitch_id='$PITCH'" >/dev/null
hid=$(q "select booking_id from hold_slot('$PITCH', '$NINE'::timestamptz, 60, 'Basel')")
as "$SALMA"
res=$(q "select ok from check_in_booking('$hid')")
check "a mere hold cannot be checked in" "$res" "f"
as "$BASEL"; q "select ok from confirm_booking('$hid')" >/dev/null
as "$SALMA"
res=$(q "select ok from check_in_booking('$hid')")
check "a confirmed booking can" "$res" "t"
res=$(q "select ok from check_in_booking('$hid')")
check "and checking in twice is harmless" "$res" "t"

echo
echo "ADM-012 — the booking's whole life is on the record"
n=$(q "select count(*) from booking_event where booking_id='$hid'")
[ "$n" -ge 3 ] && ok "audit trail has $n events" || bad "audit trail" "only $n events"
actor=$(q "select actor from booking_event where booking_id='$hid' and to_state='checked_in'")
check "and names who checked it in" "$actor" "staff · Salma Rashad"

# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------

echo
echo "OWN-004 — a closure takes inventory off sale"
q "delete from booking where pitch_id='$PITCH'" >/dev/null
avail=$(q "select available from search_availability('$PITCH', current_date + 1) where hour=22")
check "10 PM is saleable beforehand" "$avail" "t"
q "insert into availability_exception (pitch_id, during, kind, note)
   values ('$PITCH', tstzrange('$TEN'::timestamptz, '$TEN'::timestamptz + interval '1 hour', '[)'), 'maintenance', 'Floodlight repair')" >/dev/null
avail=$(q "select available from search_availability('$PITCH', current_date + 1) where hour=22")
check "the closed hour leaves search" "$avail" "f"
src=$(q "select coalesce(taken_by::text,'(none)') from search_availability('$PITCH', current_date + 1) where hour=22")
check "and is not dressed up as a booking" "$src" "(none)"
as "$BASEL"
res=$(q "select ok from hold_slot('$PITCH', '$TEN'::timestamptz, 60, 'Basel')")
check "a closure does not by itself block a hold (the calendar does)" "$res" "t"
q "delete from booking where pitch_id='$PITCH'; delete from availability_exception where pitch_id='$PITCH'" >/dev/null

echo
echo "VEN-001 / VEN-003 — search across every venue"
anon
n=$(q "select count(*) from search_venues(current_date + 1)")
[ "$n" -ge 2 ] && ok "more than one venue is discoverable ($n)" || bad "multi-venue search" "got $n"
v=$(q "select name from search_venues(current_date + 1) limit 1")
check "verified venues sort first" "$v" "Stadium One"
s=$(q "select open_slots from search_venues(current_date + 1) where name='Stadium One'")
[ "$s" -gt 0 ] && ok "live slot counts come from the real timeline ($s)" || bad "slot count" "got $s"
d=$(q "select distance_km from search_venues(current_date + 1, 'Africa/Cairo', 30.0600, 31.3300) where name='Stadium One'")
[ -n "$d" ] && ok "distance is computed when the player shares a location ($d km)" || bad "distance" "empty"
d=$(q "select coalesce(distance_km::text,'(null)') from search_venues(current_date + 1) where name='Stadium One'")
check "and is null rather than fabricated when they do not" "$d" "(null)"

echo
echo "VEN-001 — a booked hour lowers the count search reports"
before=$(q "select open_slots from search_venues(current_date + 1) where name='Stadium One'")
as "$SALMA"; q "select ok from record_offline_booking('$PITCH', '$NINE'::timestamptz, 60, 'walk_in', 'Walk-in')" >/dev/null
anon
after=$(q "select open_slots from search_venues(current_date + 1) where name='Stadium One'")
check "the count drops by exactly one" "$((before - after))" "1"

echo
echo "VEN-008 — only someone who played may review"
as "$BASEL"
b=$(q "select id from booking where pitch_id='$PITCH' and state='confirmed' and captain_id='$BASEL' limit 1")
if [ -z "$b" ]; then
  q "delete from booking where pitch_id='$PITCH' and during && tstzrange('$SEVEN'::timestamptz,'$SEVEN'::timestamptz+interval '1 hour')" >/dev/null
  hid=$(q "select booking_id from hold_slot('$PITCH', '$SEVEN'::timestamptz, 60, 'Basel')")
  q "select ok from confirm_booking('$hid')" >/dev/null
  b="$hid"
fi
res=$(q "select reason from submit_review('$b', 5, 'Great turf')")
check "a booking not yet played cannot be reviewed" "$res" "You can review a match once you have played it."
as "$SALMA"; q "select ok from check_in_booking('$b')" >/dev/null
as "$BASEL"
res=$(q "select ok from submit_review('$b', 5, 'Great turf')")
check "after check-in it can" "$res" "t"
n=$(q "select rating_count from venue where id='$VENUE'")
check "and the venue's cached rating count moves" "$n" "1"
avg=$(q "select rating_avg from venue where id='$VENUE'")
check "with the average maintained by trigger" "$avg" "5.00"
q "select ok from submit_review('$b', 3, 'On reflection')" >/dev/null
n=$(q "select rating_count from venue where id='$VENUE'")
check "reviewing twice edits rather than stacks" "$n" "1"
avg=$(q "select rating_avg from venue where id='$VENUE'")
check "and the average follows the edit" "$avg" "3.00"
as "$KARIM"
res=$(q "select reason from submit_review('$b', 1, 'Never been here')")
check "someone else's booking is not reviewable" "$res" "You can only review a booking you made."

echo
echo "An hour that has already started is not for sale"
YESTERDAY=$(q "select ((current_date - 1 + interval '21 hours') at time zone 'Africa/Cairo')::text")
as "$BASEL"
res=$(q "select reason from hold_slot('$PITCH', '$YESTERDAY'::timestamptz, 60, 'Basel')")
check "a hold on a finished hour is refused" "$res" "That slot has already started."
n=$(q "select count(*) from booking where pitch_id='$PITCH' and during && tstzrange('$YESTERDAY'::timestamptz,'$YESTERDAY'::timestamptz+interval '1 hour')")
check "and nothing is written" "$n" "0"
avail=$(q "select bool_or(available) from search_availability('$PITCH', current_date - 1)")
check "search offers nothing on a day that has passed" "$avail" "f"
n=$(q "select count(*) from search_availability('$PITCH', current_date - 1)")
check "though the hours are still listed, so the grid is not full of holes" "$n" "6"

echo
echo "P-02 — Home can ask what you are doing next"
# A booking that has definitely not finished yet. The cases above leave Basel's
# most recent booking earlier the same evening, so reusing it made this section
# pass before kick-off and fail after it.
as "$BASEL"
q "delete from booking where pitch_id='$PITCH' and during && tstzrange('$TOMORROW'::timestamptz,'$TOMORROW'::timestamptz+interval '1 hour')" >/dev/null
hid=$(q "select booking_id from hold_slot('$PITCH', '$TOMORROW'::timestamptz, 60, 'Basel')")
q "select ok from confirm_booking('$hid')" >/dev/null
n=$(q "select count(*) from my_next_booking()")
check "the player's next booking is one call" "$n" "1"
v=$(q "select venue_name from my_next_booking()")
check "and it names the venue, not a fixture" "$v" "Stadium One"
as "$KARIM"
n=$(q "select count(*) from my_next_booking()")
check "and it is scoped to the caller" "$n" "0"

echo
printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
