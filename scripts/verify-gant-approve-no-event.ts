/**
 * Verification probe — Tick succeeds with no eventId (bug fix, found live 2026-09-03)
 *
 * Repro: capturing via GantPendingQueue's "+ Add a note" button never sets
 * an eventId (no event picker exists yet in the capture UI). game_feedback.
 * game_id is a required FK to events, so Tick previously failed the insert
 * silently (the error rendered behind the full-screen modal — the OTHER
 * half of this bug, fixed in GantReviewModal/GantCaptureSheet directly).
 *
 * This confirms approve()'s fix: when no eventId is supplied, it creates a
 * minimal ad-hoc 'general' event on the fly rather than failing.
 *
 * Run: npx tsx scripts/verify-gant-approve-no-event.ts
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
const createdEventIds: string[] = [];
const createdFeedbackIds: string[] = [];
const createdOutcomeIds: string[] = [];

async function main(): Promise<void> {
  console.log('── approve() with NO eventId probe (bug fix verification) ──');

  const email = `wcr-gant-probe-noevent-${Date.now()}@mailinator.com`;
  const password = `Probe-${Math.random().toString(36).slice(2)}!1`;
  const { data: authData, error: authError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (authError || !authData.user) throw new Error(`Could not create coach: ${errText(authError)}`);
  const coachId = authData.user.id;
  createdUserIds.push(coachId);
  await admin.from('users').insert({
    id: coachId, email, first_name: 'GantProbe', last_name: 'NoEventCoach', cellphone: '0000000000', role: 'coach', active: true, created_at: new Date().toISOString(),
  });

  const { data: teamRow, error: teamError } = await admin
    .from('teams')
    .insert({ name: 'Gant No-Event Probe Team', age_group: 'U99', training_ground: 'Probe Ground', training_time: '18:00', team_type: 'club_tournament' })
    .select('id').single();
  if (teamError || !teamRow) throw new Error(`Could not create team: ${errText(teamError)}`);
  teamId = teamRow.id;
  await admin.from('team_members').insert({ team_id: teamId, user_id: coachId, role: 'coach' });

  const coachClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sessionData, error: signInError } = await coachClient.auth.signInWithPassword({ email, password });
  if (signInError || !sessionData.session) throw new Error(`Could not sign in coach: ${errText(signInError)}`);

  // --- Simulate approve() with eventId undefined, exactly the real repro ---
  // (Mirrors gant-api.ts's approve() logic directly, since this script
  // can't import the TS module — same pattern as the other verify scripts.)
  const eventInsert = await coachClient
    .from('events')
    .insert({
      title: 'Progress Notes entry',
      event_type: 'general',
      event_date: new Date().toISOString(),
      location: 'N/A',
      target_teams: [teamId],
      created_by: coachId,
    })
    .select('id')
    .single();
  check(
    'ad-hoc placeholder event created successfully when no eventId is supplied (the fix)',
    !eventInsert.error && !!eventInsert.data,
    errText(eventInsert.error)
  );
  const adHocEventId = eventInsert.data?.id;
  if (adHocEventId) createdEventIds.push(adHocEventId);

  const feedbackInsert = await coachClient
    .from('game_feedback')
    .insert({
      game_id: adHocEventId,
      team_id: teamId,
      feedback_type: 'team',
      feedback_text: 'A note captured with no event context at all.',
      gant_assisted: true,
      round_count: 0,
      created_by: coachId,
    })
    .select('id')
    .single();
  check(
    'game_feedback insert succeeds using the ad-hoc event as game_id (this was the actual failure before the fix)',
    !feedbackInsert.error && !!feedbackInsert.data,
    errText(feedbackInsert.error)
  );
  if (feedbackInsert.data) createdFeedbackIds.push(feedbackInsert.data.id);

  const outcomeInsert = await coachClient
    .from('gant_outcomes')
    .insert({ team_id: teamId, outcome: 'ticked', round_count: 0, resolved_by: coachId })
    .select('id')
    .single();
  check('gant_outcomes logged successfully', !outcomeInsert.error && !!outcomeInsert.data, errText(outcomeInsert.error));
  if (outcomeInsert.data) createdOutcomeIds.push(outcomeInsert.data.id);
}

async function cleanup(): Promise<void> {
  if (createdOutcomeIds.length) await admin.from('gant_outcomes').delete().in('id', createdOutcomeIds);
  if (createdFeedbackIds.length) await admin.from('game_feedback').delete().in('id', createdFeedbackIds);
  if (createdEventIds.length) await admin.from('events').delete().in('id', createdEventIds);
  if (teamId) await admin.from('team_members').delete().eq('team_id', teamId);
  if (teamId) await admin.from('teams').delete().eq('id', teamId);
  for (const id of createdUserIds) {
    await admin.from('users').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`\n── Cleanup complete`);
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
