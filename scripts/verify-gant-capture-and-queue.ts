/**
 * Verification probe — capture + pending queue filtering (Tasks 4 & 5)
 * Spec: .kiro/specs/gant-ai-feedback-assistant/ (Task 4/5)
 *
 * Exercises the exact query shapes GantPendingQueue.tsx and GantCaptureSheet
 * rely on, without needing to render React:
 *   1. Create several pending entries across two players on one team, plus
 *      one team-scoped entry.
 *   2. Confirm the "all teams / all players" view returns everything,
 *      chronologically.
 *   3. Confirm filtering by team narrows correctly.
 *   4. Confirm filtering by team + player narrows to just that player's
 *      entries (individual entries only — the team-scoped one has no
 *      player_id and must NOT appear under a player filter).
 *   5. Confirm a DIFFERENT coach's pending entries are invisible (RLS —
 *      migration 068's "own entries only" policy).
 *
 * Throwaway fixtures, cleaned up on every exit path.
 *
 * Run: npx tsx scripts/verify-gant-capture-and-queue.ts
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');

function loadEnvFile(file: string): void {
  const path = resolve(projectRoot, file);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile('.env.development');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('BLOCKED: missing required env vars');
  process.exit(2);
}

const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function errText(e: unknown): string {
  if (!e) return 'none';
  const o = e as { message?: string; code?: string };
  return `${o.code ?? ''} ${o.message ?? String(e)}`.trim();
}

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const createdUserIds: string[] = [];
let teamId: string | null = null;
const createdEntryIds: string[] = [];

async function createFixtureUser(role: 'coach' | 'player', label: string) {
  const email = `wcr-gant-probe-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@mailinator.com`;
  const password = `Probe-${Math.random().toString(36).slice(2)}!1`;
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError || !authData.user) throw new Error(`Could not create ${label}: ${errText(authError)}`);
  createdUserIds.push(authData.user.id);
  const { error: profileError } = await admin.from('users').insert({
    id: authData.user.id,
    email,
    first_name: 'GantProbe',
    last_name: label,
    cellphone: '0000000000',
    role,
    active: true,
    created_at: new Date().toISOString(),
  });
  if (profileError) throw new Error(`Could not create ${label} profile: ${errText(profileError)}`);
  return { email, password, userId: authData.user.id };
}

async function signIn(email: string, password: string) {
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`Could not sign in: ${errText(error)}`);
  return { client, token: data.session.access_token };
}

async function main(): Promise<void> {
  console.log('── Progress Notes capture + pending-queue filtering probe (Tasks 4/5) ──');

  const coachA = await createFixtureUser('coach', 'coachA');
  const coachB = await createFixtureUser('coach', 'coachB');
  const playerX = await createFixtureUser('player', 'playerX');
  const playerY = await createFixtureUser('player', 'playerY');

  const { data: teamRow, error: teamError } = await admin
    .from('teams')
    .insert({
      name: 'Gant Queue Probe Team',
      age_group: 'U99',
      training_ground: 'Probe Ground',
      training_time: '18:00',
      team_type: 'club_tournament',
    })
    .select('id')
    .single();
  if (teamError || !teamRow) throw new Error(`Could not create team: ${errText(teamError)}`);
  teamId = teamRow.id;

  const { client: coachAClient } = await signIn(coachA.email, coachA.password);

  // --- 1. Capture: three entries as Coach A (two for playerX, one team-scoped, one for playerY) --
  const captures = [
    { player_id: playerX.userId, text: 'playerX entry 1' },
    { player_id: playerX.userId, text: 'playerX entry 2' },
    { player_id: null, text: 'team-scoped entry' },
    { player_id: playerY.userId, text: 'playerY entry 1' },
  ];
  for (const c of captures) {
    const { data: row, error } = await coachAClient
      .from('gant_pending_entries')
      .insert({
        team_id: teamId,
        player_id: c.player_id,
        raw_text: [{ text: c.text, at: new Date().toISOString() }],
        captured_by: coachA.userId,
      })
      .select('id')
      .single();
    check(`captured: "${c.text}"`, !error && !!row, errText(error));
    if (row) createdEntryIds.push(row.id);
  }

  // A second coach's own entry, to confirm RLS isolation later.
  const { client: coachBClient } = await signIn(coachB.email, coachB.password);
  const { data: coachBRow, error: coachBError } = await coachBClient
    .from('gant_pending_entries')
    .insert({
      team_id: teamId,
      player_id: playerX.userId,
      raw_text: [{ text: "coach B's own entry", at: new Date().toISOString() }],
      captured_by: coachB.userId,
    })
    .select('id')
    .single();
  check("coach B's own entry captured", !coachBError && !!coachBRow, errText(coachBError));
  if (coachBRow) createdEntryIds.push(coachBRow.id);

  // --- 2. "All teams / all players" — as Coach A --------------------------
  const { data: allEntries, error: allError } = await coachAClient
    .from('gant_pending_entries')
    .select('*')
    .order('captured_at', { ascending: true });
  check(
    'Coach A sees exactly their own 4 entries with no filter applied (RLS scopes to captured_by)',
    !allError && allEntries?.length === 4,
    `count=${allEntries?.length} error=${errText(allError)}`
  );

  // --- 3. Filter by team ----------------------------------------------------
  const { data: teamFiltered, error: teamFilterError } = await coachAClient
    .from('gant_pending_entries')
    .select('*')
    .eq('team_id', teamId)
    .order('captured_at', { ascending: true });
  check(
    'filtering by team returns all 4 of Coach A\'s entries for that team',
    !teamFilterError && teamFiltered?.length === 4,
    `count=${teamFiltered?.length}`
  );

  // --- 4. Filter by team + player -------------------------------------------
  const { data: playerFiltered, error: playerFilterError } = await coachAClient
    .from('gant_pending_entries')
    .select('*')
    .eq('team_id', teamId)
    .eq('player_id', playerX.userId)
    .order('captured_at', { ascending: true });
  check(
    'filtering by team + playerX returns exactly playerX\'s 2 entries (not the team-scoped one, not playerY\'s)',
    !playerFilterError && playerFiltered?.length === 2 && playerFiltered.every((e) => e.player_id === playerX.userId),
    `count=${playerFiltered?.length} playerIds=${JSON.stringify(playerFiltered?.map((e) => e.player_id))}`
  );

  // --- 5. RLS isolation: Coach A cannot see Coach B's entry -----------------
  const { data: crossCoachCheck } = await coachAClient
    .from('gant_pending_entries')
    .select('id')
    .eq('id', coachBRow!.id);
  check(
    "Coach A cannot see Coach B's pending entry (RLS: own entries only)",
    (crossCoachCheck?.length ?? 0) === 0,
    `visibleCount=${crossCoachCheck?.length}`
  );
}

async function cleanup(): Promise<void> {
  if (createdEntryIds.length) await admin.from('gant_pending_entries').delete().in('id', createdEntryIds);
  if (teamId) await admin.from('teams').delete().eq('id', teamId);
  for (const id of createdUserIds) {
    await admin.from('users').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`\n── Cleanup: removed ${createdEntryIds.length} entry(ies), 1 team, ${createdUserIds.length} user(s)`);
}

main()
  .catch((e) => {
    failed++;
    console.error('\nProbe aborted:', e instanceof Error ? e.message : e);
  })
  .finally(async () => {
    await cleanup();
    console.log(`\nResult: ${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
  });
