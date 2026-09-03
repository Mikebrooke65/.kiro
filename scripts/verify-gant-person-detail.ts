/**
 * Verification probe — person-detail / team-notes read access (Task 6/6b)
 * Spec: .kiro/specs/gant-ai-feedback-assistant/ (Task 6.7)
 *
 * Confirms migration 070's new RLS actually delivers what the person-detail
 * screen and team-notes section need, via the exact query shapes
 * gant-api.ts's getPlayerNotes/getTeamNotes/getPlayerSummary use:
 *   1. The subject player reads their own individual note.
 *   2. Their linked caregiver reads it too.
 *   3. A DIFFERENT, unrelated player cannot read it (0 rows, not filtered).
 *   4. A coach on the team can read it.
 *   5. Any team member (even a different player) reads a team-scoped note.
 *   6. The cached auto-summary is readable by the same audience as the notes.
 *
 * Throwaway fixtures, cleaned up on every exit path.
 *
 * Run: npx tsx scripts/verify-gant-person-detail.ts
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
let eventId: string | null = null;
const createdFeedbackIds: string[] = [];
const createdCaregiverLinkIds: string[] = [];
let summaryPlayerId: string | null = null;

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
  return client;
}

async function main(): Promise<void> {
  console.log('── Person-detail / team-notes read access probe (Task 6/6b) ──');

  const coach = await createFixtureUser('coach', 'coach');
  const subjectPlayer = await createFixtureUser('player', 'subject');
  const caregiver = await createFixtureUser('player', 'caregiver'); // role doesn't matter for a caregiver; using 'player' since caregiver isn't a users.role value
  const otherPlayer = await createFixtureUser('player', 'other');
  summaryPlayerId = subjectPlayer.userId;

  const { data: teamRow, error: teamError } = await admin
    .from('teams')
    .insert({
      name: 'Gant Person Detail Probe Team',
      age_group: 'U99',
      training_ground: 'Probe Ground',
      training_time: '18:00',
      team_type: 'club_tournament',
    })
    .select('id')
    .single();
  if (teamError || !teamRow) throw new Error(`Could not create team: ${errText(teamError)}`);
  teamId = teamRow.id;

  // Link caregiver to subjectPlayer.
  const { data: linkRow, error: linkError } = await admin
    .from('player_caregivers')
    .insert({ player_id: subjectPlayer.userId, caregiver_id: caregiver.userId })
    .select('id')
    .single();
  if (linkError || !linkRow) throw new Error(`Could not create caregiver link: ${errText(linkError)}`);
  createdCaregiverLinkIds.push(linkRow.id);

  // The coach needs an actual team_members row with role='coach' on THIS
  // team — migration 022's coach-read policy is scoped per-team, not just
  // users.role='coach' globally.
  const { error: coachMemberError } = await admin
    .from('team_members')
    .insert({ team_id: teamId, user_id: coach.userId, role: 'coach' });
  if (coachMemberError) throw new Error(`Could not add coach to team_members: ${errText(coachMemberError)}`);

  const { data: eventRow, error: eventError } = await admin
    .from('events')
    .insert({
      title: 'Gant Person Detail Probe Training',
      event_type: 'training',
      event_date: new Date().toISOString(),
      location: 'Probe Ground',
      created_by: coach.userId,
    })
    .select('id')
    .single();
  if (eventError || !eventRow) throw new Error(`Could not create fixture event: ${errText(eventError)}`);
  eventId = eventRow.id;

  // An individual note about subjectPlayer, plus a team-scoped note.
  const { data: individualNote, error: individualError } = await admin
    .from('game_feedback')
    .insert({
      game_id: eventId,
      team_id: teamId,
      feedback_type: 'player',
      player_id: subjectPlayer.userId,
      feedback_text: 'Great composure on the ball today.',
      gant_assisted: true,
      created_by: coach.userId,
    })
    .select('id')
    .single();
  check('individual note fixture created', !individualError && !!individualNote, errText(individualError));
  if (individualNote) createdFeedbackIds.push(individualNote.id);

  const { data: teamNote, error: teamNoteError } = await admin
    .from('game_feedback')
    .insert({
      game_id: eventId,
      team_id: teamId,
      feedback_type: 'team',
      feedback_text: 'Whole team pressed really well as a unit.',
      gant_assisted: true,
      created_by: coach.userId,
    })
    .select('id')
    .single();
  check('team-scoped note fixture created', !teamNoteError && !!teamNote, errText(teamNoteError));
  if (teamNote) createdFeedbackIds.push(teamNote.id);

  await admin
    .from('gant_player_summaries')
    .upsert({ player_id: subjectPlayer.userId, summary_text: 'A strong run of sessions overall.' });

  // --- 1. The subject player reads their own note ---------------------------
  const subjectClient = await signIn(subjectPlayer.email, subjectPlayer.password);
  const { data: subjectSees, error: subjectError } = await subjectClient
    .from('game_feedback')
    .select('id')
    .eq('feedback_type', 'player')
    .eq('player_id', subjectPlayer.userId);
  check(
    'the subject player reads their own individual note',
    !subjectError && (subjectSees?.length ?? 0) === 1,
    `count=${subjectSees?.length} error=${errText(subjectError)}`
  );

  // --- 2. Their linked caregiver reads it too --------------------------------
  const caregiverClient = await signIn(caregiver.email, caregiver.password);
  const { data: caregiverSees, error: caregiverError } = await caregiverClient
    .from('game_feedback')
    .select('id')
    .eq('feedback_type', 'player')
    .eq('player_id', subjectPlayer.userId);
  check(
    "the linked caregiver reads the subject player's individual note",
    !caregiverError && (caregiverSees?.length ?? 0) === 1,
    `count=${caregiverSees?.length} error=${errText(caregiverError)}`
  );

  // --- 3. A different, unrelated player CANNOT read it -----------------------
  const otherClient = await signIn(otherPlayer.email, otherPlayer.password);
  const { data: otherSees, error: otherError } = await otherClient
    .from('game_feedback')
    .select('id')
    .eq('feedback_type', 'player')
    .eq('player_id', subjectPlayer.userId);
  check(
    "an unrelated player CANNOT read the subject player's individual note (0 rows, RLS-enforced)",
    !otherError && (otherSees?.length ?? 0) === 0,
    `count=${otherSees?.length}`
  );

  // --- 4. A coach on the team can read it ------------------------------------
  const coachClient = await signIn(coach.email, coach.password);
  const { data: coachSees, error: coachError } = await coachClient
    .from('game_feedback')
    .select('id')
    .eq('feedback_type', 'player')
    .eq('player_id', subjectPlayer.userId);
  check(
    "a coach reads the subject player's individual note",
    !coachError && (coachSees?.length ?? 0) === 1,
    `count=${coachSees?.length} error=${errText(coachError)}`
  );

  // --- 5. Any team member reads a team-scoped note ---------------------------
  // otherPlayer has no team_members row yet — add one so this genuinely
  // tests "any team member", not just the coach.
  const { error: memberError } = await admin
    .from('team_members')
    .insert({ team_id: teamId, user_id: otherPlayer.userId, role: 'player' });
  check('otherPlayer added as a team member (fixture step)', !memberError, errText(memberError));

  const { data: otherSeesTeamNote, error: otherTeamError } = await otherClient
    .from('game_feedback')
    .select('id')
    .eq('feedback_type', 'team')
    .eq('team_id', teamId);
  check(
    'a team member (even one unrelated to the individual note above) reads the team-scoped note',
    !otherTeamError && (otherSeesTeamNote?.length ?? 0) === 1,
    `count=${otherSeesTeamNote?.length} error=${errText(otherTeamError)}`
  );

  // --- 6. The cached auto-summary is readable by the same audience ----------
  const { data: subjectSummary } = await subjectClient
    .from('gant_player_summaries')
    .select('summary_text')
    .eq('player_id', subjectPlayer.userId)
    .maybeSingle();
  check(
    'the subject player reads their own cached auto-summary',
    subjectSummary?.summary_text === 'A strong run of sessions overall.',
    JSON.stringify(subjectSummary)
  );

  const { data: otherSummary } = await otherClient
    .from('gant_player_summaries')
    .select('summary_text')
    .eq('player_id', subjectPlayer.userId)
    .maybeSingle();
  check(
    'an unrelated player CANNOT read the subject player\'s summary',
    otherSummary == null,
    JSON.stringify(otherSummary)
  );
}

async function cleanup(): Promise<void> {
  if (summaryPlayerId) await admin.from('gant_player_summaries').delete().eq('player_id', summaryPlayerId);
  if (createdFeedbackIds.length) await admin.from('game_feedback').delete().in('id', createdFeedbackIds);
  if (createdCaregiverLinkIds.length) await admin.from('player_caregivers').delete().in('id', createdCaregiverLinkIds);
  if (teamId) await admin.from('team_members').delete().eq('team_id', teamId);
  if (eventId) await admin.from('events').delete().eq('id', eventId);
  if (teamId) await admin.from('teams').delete().eq('id', teamId);
  for (const id of createdUserIds) {
    await admin.from('users').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`\n── Cleanup: removed fixtures (${createdUserIds.length} users, 1 team, ${createdFeedbackIds.length} notes)`);
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
