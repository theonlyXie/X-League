#!/usr/bin/env node
/**
 * Connects to ymuknkhapibmtqkrlmia Supabase, applies the seed RPC migration if
 * needed, seeds demo data, and prints venue/pitch ids for .env.
 *
 * Run: node scripts/setup-supabase.mjs
 * Requires EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  if (!existsSync('.env')) throw new Error('Missing .env — add Supabase URL and anon key');
  const env = {};
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env');

  const sb = createClient(url, key);
  console.log('Project:', url);

  // Check if seed RPC exists
  let { data: seedResult, error: seedErr } = await sb.rpc('seed_demo_evening');
  if (seedErr?.message?.includes('Could not find the function')) {
    console.log('\n⚠️  Run this SQL in Supabase → SQL Editor first:\n');
    console.log('   supabase/setup_remote.sql\n');
    console.log('Then re-run: node scripts/setup-supabase.mjs\n');
    process.exit(1);
  }
  if (seedErr) throw seedErr;
  console.log('Seed:', seedResult);

  const { data: venues, error: vErr } = await sb.rpc('list_player_venues');
  if (vErr) throw vErr;
  const stadiumA = venues.find((v) => v.venue_name === 'Stadium One' && v.pitch_label === 'Pitch A');
  if (!stadiumA) {
    console.log('No Stadium One Pitch A found after seed.');
    process.exit(1);
  }

  console.log('\nStadium One · Pitch A');
  console.log('  EXPO_PUBLIC_VENUE_ID=' + stadiumA.venue_id);
  console.log('  EXPO_PUBLIC_PITCH_ID=' + stadiumA.pitch_id);

  // Patch .env
  let dotenv = readFileSync('.env', 'utf8');
  const set = (k, v) => {
    const re = new RegExp(`^${k}=.*$`, 'm');
    dotenv = re.test(dotenv) ? dotenv.replace(re, `${k}=${v}`) : dotenv + `\n${k}=${v}`;
  };
  set('EXPO_PUBLIC_VENUE_ID', stadiumA.venue_id);
  set('EXPO_PUBLIC_PITCH_ID', stadiumA.pitch_id);
  writeFileSync('.env', dotenv.trim() + '\n');
  console.log('\n✓ Updated .env with venue and pitch ids');

  const { data: slots } = await sb.rpc('search_availability', {
    p_pitch_id: stadiumA.pitch_id,
    p_date: '2026-08-18',
  });
  console.log(`✓ search_availability returned ${slots?.length ?? 0} slots for Tue 18 Aug 2026`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
