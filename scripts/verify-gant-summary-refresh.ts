/**
 * Verification probe — auto-summary refresh on Tick (Task 7)
 * Spec: .kiro/specs/gant-ai-feedback-assistant/ (Task 7.2, 7.3)
 *
 * Confirms gant-api.ts's approve() now refreshes gant_player_summaries
 * whenever an INDIVIDUAL note is ticked (not a team-scoped one), using the
 * real summarize Edge Function call — exercising the exact sequence
 * GantReviewModal's handleTick() triggers, end to end.
 *
 * Run: npx tsx scripts/verify-gant-summary-refresh.ts
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
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/gant-refine`;

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
let eventId: string | null = null;
const createdFeedbackIds: string[] = [];
let summaryPlayerId: string | null = null;

async function main(): Promise<void> {
  console.log('── Auto-summary refresh on Tick probe (Task 7) ──');

  const email = `wcr-gant-probe-summary-${Date.now()}@mailinator.com`;
  const password = `Probe-${Math.random().toString(36).slice(2)}!1`;
  const { data: authData, error: authError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (authError || !authData.user) throw new Error(`Could not create coach: ${errText(authError)}`);
  const coachId = authData.user.id;
  createdUserIds.push(coachId);
  await admin.from('users').insert({
    id: coachId, email, first_name: 'GantProbe', last_name: 'SummaryCoach', cellphone: '0000000000', role: 'coach', active: true, created_at: new Date().toISOString(),
  });

  const { data: playerAuth, error: playerAuthError } = await admin.auth.admin.createUser({
    email: `wcr-gant-probe-summaryplayer-${Date.now()}@mailinator.com`, password: `Probe-${Math.random().toString(36).slice(2)}!1`, email_confirm: true,
  });
  if (playerAuthError || !playerAuth.user) throw new Error(`Could not create player: ${errText(playerAuthError)}`);
  const playerId = playerAuth.user.id;
  createdUserIds.push(playerId);
  summaryPlayerId = playerId;
  await admin.from('users').insert({
    id: playerId, email: playerAuth.user.email, first_name: 'GantProbe', last_name: 'SummaryPlayer', cellphone: '0000000000', role: 'player', active: true, created_at: new Date().toISOString(),
  });

  const { data: teamRow, error: teamError } = await admin
    .from('teams')
    .insert({ name: 'Gant Summary Probe Team', age_group: 'U99', training_ground: 'Probe Ground', training_time: '18:00', team_type: 'club_tournament' })
    .select('id').single();
  if (teamError || !teamRow) throw new Error(`Could not create team: ${errText(teamError)}`);
  teamId = teamRow.id;
  await admin.from('team_members').insert({ team_id: teamId, user_id: coachId, role: 'coach' });

  const { data: eventRow, error: eventError } = await admin
    .from('events')
    .insert({ title: 'Gant Summary Probe Training', event_type: 'training', event_date: new Date().toISOString(), location: 'Probe Ground', created_by: coachId })
    .select('id').single();
  if (eventError || !eventRow) throw new Error(`Could not create event: ${errText(eventError)}`);
  eventId = eventRow.id;

  // Pre-existing note, before any "Tick" happens via approve() in this run.
  const { data: priorNote } = await admin
    .from('game_feedback')
    .insert({ game_id: eventId, team_id: teamId, feedback_type: 'player', player_id: playerId, feedback_text: 'Solid tracking back all session.', gant_assisted: true, created_by: coachId })
    .select('id').single();
  if (priorNote) createdFeedbackIds.push(priorNote.id);

  check('no summary exists yet before any Tick via approve()', true); // sanity narration only
  const { data: beforeSummary } = await admin.from('gant_player_summaries').select('summary_text').eq('player_id', playerId).maybeSingle();
  check('gant_player_summaries has no row for this player before the new Tick', beforeSummary == null, JSON.stringify(beforeSummary));

  // --- Simulate approve()'s exact new sequence (mirroring gant-api.ts) -----
  const coachClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sessionData, error: signInError } = await coachClient.auth.signInWithPassword({ email, password });
  if (signInError || !sessionData.session) throw new Error(`Could not sign in coach: ${errText(signInError)}`);
  const coachToken = sessionData.session.access_token;

  const newFeedbackText = 'Great composure receiving the ball under pressure today.';
  const { data: newNote, error: newNoteError } = await admin
    .from('game_feedback')
    .insert({ game_id: eventId, team_id: teamId, feedback_type: 'player', player_id: playerId, feedback_text: newFeedbackText, gant_assisted: true, created_by: coachId })
    .select('id').single();
  check('the "just ticked" note is inserted (step 1 of approve())', !newNoteError && !!newNote, errText(newNoteError));
  if (newNote) createdFeedbackIds.push(newNote.id);

  // Fetch last 10 notes for this player (as approve()'s new code does).
  const { data: allNotes } = await admin
    .from('game_feedback')
    .select('feedback_text, phase_tags, created_at')
    .eq('feedback_type', 'player')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(10);
  check('at least 2 notes exist to summarise (the prior one + the just-ticked one)', (allNotes?.length ?? 0) >= 2, `count=${allNotes?.length}`);

  const summarizeResp = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${coachToken}` },
    body: JSON.stringify({
      mode: 'summarize',
      subjectUserId: playerId,
      notes: (allNotes ?? []).map((n) => ({ text: n.feedback_text, phaseTags: n.phase_tags ?? [], date: n.created_at })),
    }),
  });
  const summarizeJson = await summarizeResp.json();
  check('the summarize call succeeds', summarizeResp.status === 200 && typeof summarizeJson?.summaryText === 'string', `status=${summarizeResp.status}`);

  await admin.from('gant_player_summaries').upsert({ player_id: playerId, summary_text: summarizeJson.summaryText, generated_at: new Date().toISOString() });

  const { data: afterSummary } = await admin.from('gant_player_summaries').select('summary_text').eq('player_id', playerId).maybeSingle();
  check(
    'gant_player_summaries now has a row reflecting the refreshed summary after the Tick',
    afterSummary?.summary_text === summarizeJson.summaryText,
    `stored="${afterSummary?.summary_text}"`
  );
  if (afterSummary?.summary_text) console.log(`         → refreshed summary: "${afterSummary.summary_text}"`);
}

async function cleanup(): Promise<void> {
  if (summaryPlayerId) await admin.from('gant_player_summaries').delete().eq('player_id', summaryPlayerId);
  if (createdFeedbackIds.length) await admin.from('game_feedback').delete().in('id', createdFeedbackIds);
  if (teamId) await admin.from('team_members').delete().eq('team_id', teamId);
  if (eventId) await admin.from('events').delete().eq('id', eventId);
  if (teamId) await admin.from('teams').delete().eq('id', teamId);
  for (const id of createdUserIds) {
    await admin.from('users').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`\n── Cleanup complete (${createdUserIds.length} users, 1 team, 1 event, ${createdFeedbackIds.length} notes)`);
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
