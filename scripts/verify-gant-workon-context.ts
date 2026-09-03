/**
 * Verification probe — "Work on" retains conversational context (bug fix, found live 2026-09-03)
 *
 * Repro from the repo owner's live test: a first round produced a genuinely
 * good refined draft. Hitting "Work on" and adding one more sentence caused
 * Gant to regress into asking basic clarifying questions (age group, "what
 * did the player do well") — because the follow-up call had no memory of
 * Gant's own prior response, so it looked like two disconnected fragments
 * rather than a continued conversation.
 *
 * This confirms the fix: passing `priorResponse` (Gant's most recent output)
 * and `ageGroup` (already-known team data) lets a "Work on" round build on
 * what Gant already said, rather than resetting the conversation.
 *
 * Run: npx tsx scripts/verify-gant-workon-context.ts
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
  console.log('── "Work on" conversational context probe (bug fix, 2026-09-03) ──');

  const email = `wcr-gant-probe-workon-${Date.now()}@mailinator.com`;
  const password = `Probe-${Math.random().toString(36).slice(2)}!1`;
  const { data: authData, error: authError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (authError || !authData.user) throw new Error(`Could not create coach: ${errText(authError)}`);
  createdUserIds.push(authData.user.id);
  await admin.from('users').insert({
    id: authData.user.id, email, first_name: 'GantProbe', last_name: 'WorkOnCoach', cellphone: '0000000000', role: 'coach', active: true, created_at: new Date().toISOString(),
  });

  const coachClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sessionData, error: signInError } = await coachClient.auth.signInWithPassword({ email, password });
  if (signInError || !sessionData.session) throw new Error(`Could not sign in coach: ${errText(signInError)}`);
  const token = sessionData.session.access_token;

  // --- Round 1: a genuine observation, with ageGroup supplied -------------
  const round1 = await callFunction(
    {
      mode: 'review',
      scope: 'team',
      eventType: 'training',
      ageGroup: 'Open',
      rounds: ['the boys pressed really well as a unit today, good energy in the middle third'],
    },
    token
  );
  check('round 1 succeeds and returns a valid kind', round1.status === 200 && (round1.json?.kind === 'refined' || round1.json?.kind === 'question'), `status=${round1.status}`);
  check('Gant did NOT ask about age group when it was supplied', !/age group|age band|what age/i.test(round1.json?.text ?? ''), `text="${round1.json?.text}"`);
  console.log(`         → round 1 (${round1.json?.kind}): "${round1.json?.text}"`);

  // --- Round 2: a "Work on" addition, WITH priorResponse supplied ----------
  const round2 = await callFunction(
    {
      mode: 'review',
      scope: 'team',
      eventType: 'training',
      ageGroup: 'Open',
      rounds: [
        'the boys pressed really well as a unit today, good energy in the middle third',
        "don't forget to also mention their shape when they lost the ball, they recovered quickly",
      ],
      priorResponse: round1.json,
    },
    token
  );
  check('round 2 (Work on, WITH priorResponse) succeeds', round2.status === 200, `status=${round2.status}`);
  check(
    'round 2 did NOT regress into a basic clarifying question (the original bug)',
    round2.json?.kind === 'refined',
    `kind=${round2.json?.kind} text="${round2.json?.text}"`
  );
  if (round2.json?.kind === 'refined') {
    const combinesBoth =
      /press|energy|middle/i.test(round2.json.text) && /shape|recover|lost/i.test(round2.json.text);
    check(
      'round 2\'s refined text reflects BOTH the original observation AND the Work-on addition',
      combinesBoth,
      `text="${round2.json.text}"`
    );
  }
  console.log(`         → round 2 (${round2.json?.kind}): "${round2.json?.text}"`);

  // --- Round 3: a further "Work on" — confirms it keeps seeing the LATEST response, not round 1's -----
  const round3 = await callFunction(
    {
      mode: 'review',
      scope: 'team',
      eventType: 'training',
      ageGroup: 'Open',
      rounds: [
        'the boys pressed really well as a unit today, good energy in the middle third',
        "don't forget to also mention their shape when they lost the ball, they recovered quickly",
        'one more thing, our final ball into the box needs work, we gave possession away cheaply a few times',
      ],
      priorResponse: round2.json,
    },
    token
  );
  check('round 3 (a THIRD round, WITH the latest priorResponse) succeeds', round3.status === 200, `status=${round3.status}`);
  check('round 3 still does not regress into a basic question', round3.json?.kind === 'refined', `kind=${round3.json?.kind}`);
  if (round3.json?.kind === 'refined') {
    console.log(`         → round 3 (${round3.json?.kind}): "${round3.json.text}"`);
  }

  // --- Contrast: WITHOUT priorResponse, confirm the OLD bug still reproduces (sanity check on the fix itself) ---
  const round2NoContext = await callFunction(
    {
      mode: 'review',
      scope: 'team',
      eventType: 'training',
      ageGroup: 'Open',
      rounds: [
        'the boys pressed really well as a unit today, good energy in the middle third',
        "don't forget to also mention their shape when they lost the ball, they recovered quickly",
      ],
      // priorResponse deliberately omitted, simulating the pre-fix behaviour
    },
    token
  );
  console.log(`         → (contrast, no priorResponse) round 2: (${round2NoContext.json?.kind}) "${round2NoContext.json?.text}"`);
}

async function cleanup(): Promise<void> {
  for (const id of createdUserIds) {
    await admin.from('users').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`\n── Cleanup complete (${createdUserIds.length} user(s))`);
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
