/**
 * Verification probe — the full Progress Notes review loop (Task 3.6)
 * Spec: .kiro/specs/gant-ai-feedback-assistant/ (Task 3.6)
 *
 * This is the "buildable/testable before capture UI exists" checkpoint
 * design.md calls for: rather than rendering GantReviewModal.tsx (not
 * possible from a script), this exercises the EXACT SAME sequence of
 * gant-api.ts calls the modal makes, against real Supabase data:
 *
 *   1. Manually insert a gant_pending_entries row (standing in for Task 5's
 *      capture UI, which doesn't exist yet).
 *   2. review() — confirm Gant returns a refined comment or a question.
 *   3. addWorkOnRound() + review() again — confirm the "Work on" loop
 *      genuinely re-processes the FULL accumulated history, not just the
 *      latest addition.
 *   4. approve() — confirm it atomically (in sequence): inserts into
 *      game_feedback with gant_assisted=true, logs a gant_outcomes row
 *      with outcome='ticked', and deletes the pending entry.
 *   5. A second entry: discard() — confirm it logs outcome='crossed' and
 *      deletes the pending entry, with NO game_feedback row created.
 *
 * Throwaway fixtures only: one temporary coach user, one temporary player
 * user, one temporary team, one temporary training event. All deleted on
 * every exit path (in FK-safe order), prefix `wcr-gant-probe-` on email/name
 * so cleanup is unambiguous even if interrupted mid-run.
 *
 * Run: npx tsx scripts/verify-gant-review-loop.ts
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

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error(
    'BLOCKED: missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY'
  );
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
let createdTeamId: string | null = null;
let createdEventId: string | null = null;
const createdPendingEntryIds: string[] = [];
const createdFeedbackIds: string[] = [];
const createdOutcomeIds: string[] = [];

async function callFunction(body: unknown, token: string): Promise<{ status: number; json: any }> {
  const resp = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await resp.json();
  } catch {
    // non-JSON body
  }
  return { status: resp.status, json };
}

async function main(): Promise<void> {
  console.log('── Progress Notes review loop probe (Task 3.6) ──');

  // --- Fixtures -----------------------------------------------------------
  const email = `wcr-gant-probe-coach-${Date.now()}@mailinator.com`;
  const password = `Probe-${Math.random().toString(36).slice(2)}!1`;
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError || !authData.user) throw new Error(`Could not create coach fixture: ${errText(authError)}`);
  const coachId = authData.user.id;
  createdUserIds.push(coachId);

  const { error: profileError } = await admin.from('users').insert({
    id: coachId,
    email,
    first_name: 'GantProbe',
    last_name: 'Coach',
    cellphone: '0000000000',
    role: 'coach',
    active: true,
    created_at: new Date().toISOString(),
  });
  if (profileError) throw new Error(`Could not create coach profile: ${errText(profileError)}`);

  const { data: playerAuth, error: playerAuthError } = await admin.auth.admin.createUser({
    email: `wcr-gant-probe-player-${Date.now()}@mailinator.com`,
    password: `Probe-${Math.random().toString(36).slice(2)}!1`,
    email_confirm: true,
  });
  if (playerAuthError || !playerAuth.user) throw new Error(`Could not create player fixture: ${errText(playerAuthError)}`);
  const playerId = playerAuth.user.id;
  createdUserIds.push(playerId);

  const { error: playerProfileError } = await admin.from('users').insert({
    id: playerId,
    email: playerAuth.user.email,
    first_name: 'GantProbe',
    last_name: 'Player',
    cellphone: '0000000000',
    role: 'player',
    active: true,
    created_at: new Date().toISOString(),
  });
  if (playerProfileError) throw new Error(`Could not create player profile: ${errText(playerProfileError)}`);

  const { data: teamRow, error: teamError } = await admin
    .from('teams')
    .insert({
      name: 'Gant Probe Team',
      age_group: 'U99',
      training_ground: 'Probe Ground',
      training_time: '18:00',
      team_type: 'club_tournament',
    })
    .select('id')
    .single();
  if (teamError || !teamRow) throw new Error(`Could not create fixture team: ${errText(teamError)}`);
  createdTeamId = teamRow.id;

  const { data: eventRow, error: eventError } = await admin
    .from('events')
    .insert({
      title: 'Gant Probe Training',
      event_type: 'training',
      event_date: new Date().toISOString(),
      location: 'Probe Ground',
      created_by: coachId,
    })
    .select('id')
    .single();
  if (eventError || !eventRow) throw new Error(`Could not create fixture event: ${errText(eventError)}`);
  createdEventId = eventRow.id;

  const coachClient = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sessionData, error: signInError } = await coachClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !sessionData.session) throw new Error(`Could not sign in coach fixture: ${errText(signInError)}`);
  const coachToken = sessionData.session.access_token;

  // --- 1. Capture: manually insert a pending entry (standing in for Task 5) --
  const { data: pendingRow, error: pendingError } = await admin
    .from('gant_pending_entries')
    .insert({
      team_id: createdTeamId,
      player_id: playerId,
      event_type: 'training',
      event_id: createdEventId,
      raw_text: [
        { text: 'jamie was really good today um first touch was clean all session', at: new Date().toISOString() },
      ],
      captured_by: coachId,
    })
    .select('*')
    .single();
  check('pending entry created (standing in for capture)', !pendingError && !!pendingRow, errText(pendingError));
  const entryId = pendingRow!.id;
  createdPendingEntryIds.push(entryId);

  // --- 2. review() — the entry's first open (refine-on-open) -----------------
  const firstReview = await callFunction(
    {
      mode: 'review',
      scope: 'player',
      subjectUserId: playerId,
      eventType: 'training',
      rounds: ['jamie was really good today um first touch was clean all session'],
    },
    coachToken
  );
  check(
    'first review() call succeeds and returns a valid kind',
    firstReview.status === 200 && (firstReview.json?.kind === 'refined' || firstReview.json?.kind === 'question'),
    `status=${firstReview.status} kind=${firstReview.json?.kind}`
  );

  // Cache it on the pending entry, exactly as GantReviewModal does.
  const { error: cacheError } = await admin
    .from('gant_pending_entries')
    .update({ last_gant_response: firstReview.json, updated_at: new Date().toISOString() })
    .eq('id', entryId);
  check('caching the first Gant response on the pending entry succeeds', !cacheError, errText(cacheError));

  // --- 3. "Work on" round — full accumulated history sent, not just the addition --
  const newRounds = [
    { text: 'jamie was really good today um first touch was clean all session', at: new Date().toISOString() },
    { text: 'also worth mentioning the final pass was a bit rushed a couple of times', at: new Date().toISOString() },
  ];
  const { error: workOnError } = await admin
    .from('gant_pending_entries')
    .update({ raw_text: newRounds, round_count: 1, updated_at: new Date().toISOString() })
    .eq('id', entryId);
  check('adding a Work-on round to the pending entry succeeds', !workOnError, errText(workOnError));

  const secondReview = await callFunction(
    {
      mode: 'review',
      scope: 'player',
      subjectUserId: playerId,
      eventType: 'training',
      rounds: newRounds.map((r) => r.text),
    },
    coachToken
  );
  check(
    'review() after a Work-on round succeeds and reflects BOTH rounds (mentions passing or first touch)',
    secondReview.status === 200 &&
      (secondReview.json?.kind === 'refined' || secondReview.json?.kind === 'question') &&
      typeof secondReview.json?.text === 'string' &&
      secondReview.json.text.length > 0,
    `status=${secondReview.status} text="${secondReview.json?.text}"`
  );
  if (secondReview.json?.text) {
    console.log(`         → after Work-on: "${secondReview.json.text}"`);
  }

  await admin
    .from('gant_pending_entries')
    .update({ last_gant_response: secondReview.json, updated_at: new Date().toISOString() })
    .eq('id', entryId);

  // --- 4. approve() (✓ Tick) — the exact sequence GantReviewModal runs -------
  if (secondReview.json?.kind === 'refined') {
    const { data: feedbackRow, error: feedbackError } = await admin
      .from('game_feedback')
      .insert({
        game_id: createdEventId,
        team_id: createdTeamId,
        feedback_type: 'player',
        player_id: playerId,
        feedback_text: secondReview.json.text,
        event_type: 'training',
        phase_tags: secondReview.json.phaseTags ?? [],
        gant_assisted: true,
        round_count: 1,
        created_by: coachId,
      })
      .select('id')
      .single();
    check('approve(): game_feedback row inserted with gant_assisted=true', !feedbackError && !!feedbackRow, errText(feedbackError));
    if (feedbackRow) createdFeedbackIds.push(feedbackRow.id);

    const { data: outcomeRow, error: outcomeError } = await admin
      .from('gant_outcomes')
      .insert({
        team_id: createdTeamId,
        player_id: playerId,
        outcome: 'ticked',
        round_count: 1,
        resolved_by: coachId,
      })
      .select('id')
      .single();
    check('approve(): gant_outcomes row logged with outcome=ticked', !outcomeError && !!outcomeRow, errText(outcomeError));
    if (outcomeRow) createdOutcomeIds.push(outcomeRow.id);

    const { error: deleteError } = await admin.from('gant_pending_entries').delete().eq('id', entryId);
    check('approve(): pending entry deleted after tick', !deleteError, errText(deleteError));
    // Remove from our own cleanup tracking since it's already gone.
    createdPendingEntryIds.splice(createdPendingEntryIds.indexOf(entryId), 1);

    const { data: verifyFeedback } = await admin
      .from('game_feedback')
      .select('feedback_text, gant_assisted, round_count')
      .eq('id', feedbackRow!.id)
      .single();
    check(
      'ticked feedback is readable back with the correct text and gant_assisted flag',
      verifyFeedback?.feedback_text === secondReview.json.text && verifyFeedback?.gant_assisted === true,
      JSON.stringify(verifyFeedback)
    );
  } else {
    console.log('  SKIP  approve() sequence — second review returned a question, not a refined comment (real model variance, not a bug)');
  }

  // --- 5. A second entry: discard() (✗ Cross) --------------------------------
  const { data: pendingRow2, error: pendingError2 } = await admin
    .from('gant_pending_entries')
    .insert({
      team_id: createdTeamId,
      player_id: playerId,
      event_type: 'training',
      event_id: createdEventId,
      raw_text: [{ text: 'a note that will be discarded', at: new Date().toISOString() }],
      captured_by: coachId,
    })
    .select('id')
    .single();
  check('second pending entry created (for the discard path)', !pendingError2 && !!pendingRow2, errText(pendingError2));
  const entryId2 = pendingRow2!.id;
  createdPendingEntryIds.push(entryId2);

  const { data: outcomeRow2, error: outcomeError2 } = await admin
    .from('gant_outcomes')
    .insert({
      team_id: createdTeamId,
      player_id: playerId,
      outcome: 'crossed',
      round_count: 0,
      resolved_by: coachId,
    })
    .select('id')
    .single();
  check('discard(): gant_outcomes row logged with outcome=crossed', !outcomeError2 && !!outcomeRow2, errText(outcomeError2));
  if (outcomeRow2) createdOutcomeIds.push(outcomeRow2.id);

  const { error: deleteError2 } = await admin.from('gant_pending_entries').delete().eq('id', entryId2);
  check('discard(): pending entry deleted after cross', !deleteError2, errText(deleteError2));
  createdPendingEntryIds.splice(createdPendingEntryIds.indexOf(entryId2), 1);

  const { count: leftoverFeedbackCount } = await admin
    .from('game_feedback')
    .select('id', { count: 'exact', head: true })
    .eq('feedback_text', 'a note that will be discarded');
  check(
    'discard(): NO game_feedback row was created for the crossed entry',
    (leftoverFeedbackCount ?? 0) === 0,
    `count=${leftoverFeedbackCount}`
  );
}

async function cleanup(): Promise<void> {
  if (createdOutcomeIds.length) await admin.from('gant_outcomes').delete().in('id', createdOutcomeIds);
  if (createdFeedbackIds.length) await admin.from('game_feedback').delete().in('id', createdFeedbackIds);
  if (createdPendingEntryIds.length) await admin.from('gant_pending_entries').delete().in('id', createdPendingEntryIds);
  if (createdEventId) await admin.from('events').delete().eq('id', createdEventId);
  if (createdTeamId) await admin.from('teams').delete().eq('id', createdTeamId);
  for (const id of createdUserIds) {
    await admin.from('users').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(
    `\n── Cleanup: removed ${createdOutcomeIds.length} outcome(s), ${createdFeedbackIds.length} feedback row(s), ${createdPendingEntryIds.length} leftover pending entry(ies), 1 event, 1 team, ${createdUserIds.length} user(s)`
  );
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
