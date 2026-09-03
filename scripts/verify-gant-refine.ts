/**
 * Verification probe — gant-refine Edge Function (Task 2)
 * Spec: .kiro/specs/gant-ai-feedback-assistant/ (Task 2.7)
 *
 * What it checks, against the REAL deployed Edge Function and a REAL
 * Anthropic call (via the ANTHROPIC_API_KEY secret already set on the
 * project — this script never touches the key itself):
 *   1. An unauthenticated call is rejected (401).
 *   2. A plain player/caregiver's token is rejected (403) — the disclosure/
 *      write-authority gate (Requirement 6.2/6.4).
 *   3. A coach's token can call mode:'review' and gets back a `refined` or
 *      `question` response shape.
 *   4. An all-positive input is refined without a manufactured work-on
 *      (Requirement 3.3 / the original Gant docs' decided edge case).
 *   5. mode:'summarize' returns a plain summaryText for a short note list.
 *
 * Throwaway fixtures only: one temporary auth user with role 'coach' (not
 * added to any team, since the global-role check alone is sufficient to
 * pass the gate), one temporary auth user with role 'player' (for the
 * rejection check). Both deleted on every exit path, tracked by id, prefix
 * `wcr-gant-probe-` on email so cleanup is unambiguous even if this script
 * is interrupted mid-run.
 *
 * Run: npx tsx scripts/verify-gant-refine.ts
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

interface Fixture {
  email: string;
  password: string;
  userId: string;
}

const createdUserIds: string[] = [];

async function createFixtureUser(role: 'coach' | 'player', label: string): Promise<Fixture> {
  const email = `wcr-gant-probe-${label}-${Date.now()}@mailinator.com`;
  const password = `Probe-${Math.random().toString(36).slice(2)}!1`;

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError || !authData.user) {
    throw new Error(`Could not create fixture auth user (${label}): ${errText(authError)}`);
  }
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
  if (profileError) {
    throw new Error(`Could not create fixture profile (${label}): ${errText(profileError)}`);
  }

  return { email, password, userId: authData.user.id };
}

async function signInAndGetToken(fixture: Fixture): Promise<string> {
  const client = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: fixture.email,
    password: fixture.password,
  });
  if (error || !data.session) {
    throw new Error(`Could not sign in fixture user: ${errText(error)}`);
  }
  return data.session.access_token;
}

async function callFunction(
  body: unknown,
  token?: string
): Promise<{ status: number; json: any }> {
  const resp = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await resp.json();
  } catch {
    // non-JSON body, leave json null
  }
  return { status: resp.status, json };
}

async function main(): Promise<void> {
  console.log('── gant-refine Edge Function probe ──');

  // --- 1. Unauthenticated call is rejected -------------------------------
  const noAuth = await callFunction({ mode: 'review', scope: 'team', rounds: ['test'] });
  check('unauthenticated call rejected (401)', noAuth.status === 401, `status=${noAuth.status}`);

  // --- Fixtures -----------------------------------------------------------
  const coach = await createFixtureUser('coach', 'coach');
  const player = await createFixtureUser('player', 'player');
  const coachToken = await signInAndGetToken(coach);
  const playerToken = await signInAndGetToken(player);

  // --- 2. A plain player's token is rejected (disclosure/authority gate) --
  const playerCall = await callFunction(
    { mode: 'review', scope: 'team', rounds: ['test'] },
    playerToken
  );
  check(
    "a plain player's token is rejected (403) — Gant is never reachable by a player/caregiver",
    playerCall.status === 403,
    `status=${playerCall.status} body=${JSON.stringify(playerCall.json)}`
  );

  // --- 3. A coach's token can call mode:'review' ---------------------------
  const reviewCall = await callFunction(
    {
      mode: 'review',
      scope: 'team',
      eventType: 'training',
      rounds: [
        'the boys worked really well on their passing today um in the small sided game they were finding space really well and switching play',
      ],
    },
    coachToken
  );
  check(
    "coach's review call succeeds (200)",
    reviewCall.status === 200,
    `status=${reviewCall.status} body=${JSON.stringify(reviewCall.json)}`
  );
  const kind = reviewCall.json?.kind;
  check(
    'response has a valid kind ("refined" or "question")',
    kind === 'refined' || kind === 'question',
    `kind=${kind}`
  );
  check(
    'response has non-empty text',
    typeof reviewCall.json?.text === 'string' && reviewCall.json.text.length > 0,
    `text="${reviewCall.json?.text}"`
  );
  if (kind === 'refined') {
    console.log(`         → refined text: "${reviewCall.json.text}"`);
    console.log(`         → phaseTags: ${JSON.stringify(reviewCall.json.phaseTags)}`);
  } else {
    console.log(`         → clarifying question: "${reviewCall.json.text}"`);
  }

  // --- 4. All-positive input is not forced into a work-on -------------------
  const positiveCall = await callFunction(
    {
      mode: 'review',
      scope: 'player',
      subjectUserId: player.userId,
      eventType: 'game',
      rounds: [
        'Jamie was excellent today, first touch was clean all game, great composure under pressure, nothing to work on here honestly just a really strong performance',
      ],
    },
    coachToken
  );
  check(
    'all-positive call succeeds (200)',
    positiveCall.status === 200,
    `status=${positiveCall.status} body=${JSON.stringify(positiveCall.json)}`
  );
  if (positiveCall.json?.kind === 'refined') {
    console.log(`         → all-positive refined text: "${positiveCall.json.text}"`);
  }
  // Soft check only — Gant's exact wording isn't asserted verbatim, just that
  // it didn't error and returned a refined/question response like any other.
  check(
    'all-positive input still returns a valid kind',
    positiveCall.json?.kind === 'refined' || positiveCall.json?.kind === 'question',
    `kind=${positiveCall.json?.kind}`
  );

  // --- 5. mode:'summarize' -----------------------------------------------
  const summarizeCall = await callFunction(
    {
      mode: 'summarize',
      subjectUserId: player.userId,
      notes: [
        { text: 'Good work tracking back on defence.', phaseTags: ['Out of possession'], date: '2026-08-20' },
        { text: 'First touch is really coming along nicely.', phaseTags: ['In possession'], date: '2026-08-27' },
        { text: 'Great composure in the final third today.', phaseTags: ['Final third / creating and finishing'], date: '2026-09-03' },
      ],
    },
    coachToken
  );
  check(
    'summarize call succeeds (200)',
    summarizeCall.status === 200,
    `status=${summarizeCall.status} body=${JSON.stringify(summarizeCall.json)}`
  );
  check(
    'summarize returns non-empty summaryText',
    typeof summarizeCall.json?.summaryText === 'string' && summarizeCall.json.summaryText.length > 0,
    `summaryText="${summarizeCall.json?.summaryText}"`
  );
  if (summarizeCall.json?.summaryText) {
    console.log(`         → summary: "${summarizeCall.json.summaryText}"`);
  }
}

async function cleanup(): Promise<void> {
  for (const id of createdUserIds) {
    await admin.from('users').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id);
  }
  if (createdUserIds.length) {
    console.log(`\n── Cleanup: removed ${createdUserIds.length} fixture user(s)`);
  }
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
