/**
 * Verification probe — migration 045 (anon SELECT on teams for live invites)
 * Spec: .kiro/specs/lite-user-registration-fix/ (task 3.3, preservation deviation 5)
 *
 * What it checks: that `validateInviteCode()`'s `team:teams(*)` embed returns a
 * real team row for an ANONYMOUS visitor instead of null. Before migration 045
 * nothing granted `anon` SELECT on `public.teams`, so the embed came back null
 * and the invite page heading and success screen rendered "undefined undefined"
 * — which would have broken preservation cases 3.8 and 2.5 after the fix.
 *
 * It also checks the scope of the new policy: a team whose only invite is
 * expired/redeemed must stay invisible to `anon`.
 *
 * Throwaway fixtures only, cleaned up on every exit path. No auth users are
 * created or deleted by this script at all — it only touches `invite_codes`
 * rows it created itself, tracked by id.
 *
 * Run: npx tsx scripts/verify-anon-team-embed.ts
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Environment (same loader as the other scripts — src/lib/supabase.ts reads
// import.meta.env and cannot be imported under tsx)
// ---------------------------------------------------------------------------

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

/** The role an invite-link visitor actually has. This is the behaviour under test. */
const anon: SupabaseClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Fixtures and cleanup only. */
const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function errText(e: unknown): string {
  if (!e) return 'none';
  const o = e as { message?: string; code?: string };
  return `${o.code ?? ''} ${o.message ?? String(e)}`.trim();
}

function throwawayCode(label: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rest = '';
  for (let i = 0; i < 5; i++) rest += chars.charAt(Math.floor(Math.random() * chars.length));
  return `${label}${rest}`.slice(0, 8);
}

let passed = 0;
let failed = 0;
let skipped = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function skip(name: string, why: string): void {
  skipped++;
  console.log(`  SKIP  ${name} — ${why}`);
}

const createdInviteIds: string[] = [];

async function main(): Promise<void> {
  console.log('── Migration 045 probe: anon can read the team an invite points at ──');

  // --- Fixtures --------------------------------------------------------
  const { data: teams, error: teamErr } = await admin
    .from('teams')
    .select('id, name, age_group')
    .not('age_group', 'is', null)
    .limit(5);
  if (teamErr || !teams?.length) throw new Error(`No team available: ${errText(teamErr)}`);

  const creatorQuery = await admin.from('users').select('id').eq('role', 'admin').limit(1).maybeSingle();
  if (creatorQuery.error || !creatorQuery.data) {
    throw new Error(`No admin user for invite.created_by: ${errText(creatorQuery.error)}`);
  }
  const creatorId = creatorQuery.data.id as string;

  const liveTeam = teams[0];
  const inFuture = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();
  const inPast = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const liveCode = throwawayCode('T');
  const expiredCode = throwawayCode('X');

  // A team that has NO live invite of its own, for the negative scope check.
  let deadTeam: { id: string; name: string; age_group: string } | null = null;
  for (const t of teams.slice(1)) {
    const { count } = await admin
      .from('invite_codes')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', t.id)
      .is('redeemed_by', null)
      .gt('expires_at', new Date().toISOString());
    if ((count ?? 0) === 0) {
      deadTeam = t as typeof deadTeam;
      break;
    }
  }

  const rows = [
    {
      code: liveCode,
      team_id: liveTeam.id,
      created_by: creatorId,
      recipient_email: 'wcr-probe-045@mailinator.com',
      expires_at: inFuture,
      redeemed_by: null,
      redeemed_at: null,
    },
  ];
  if (deadTeam) {
    rows.push({
      code: expiredCode,
      team_id: deadTeam.id,
      created_by: creatorId,
      recipient_email: 'wcr-probe-045@mailinator.com',
      expires_at: inPast, // expired, so the policy must NOT expose this team
      redeemed_by: null,
      redeemed_at: null,
    });
  }

  const { data: invites, error: inviteErr } = await admin.from('invite_codes').insert(rows).select('id');
  if (inviteErr || !invites) throw new Error(`Could not create fixture invite(s): ${errText(inviteErr)}`);
  for (const i of invites) createdInviteIds.push(i.id as string);

  // --- 1. The actual validateInviteCode() query, as anon ----------------
  const { data, error } = await anon
    .from('invite_codes')
    .select('*, team:teams(*)')
    .eq('code', liveCode)
    .single();

  check('anon can read the invite row (migration 043)', !error && !!data, errText(error));
  check('team:teams(*) embed is not null (migration 045)', !!data?.team, `team=${JSON.stringify(data?.team ?? null)}`);
  check(
    'embedded team carries age_group and name, so the heading is not "undefined undefined"',
    !!data?.team?.age_group && !!data?.team?.name,
    `label="${data?.team?.age_group} ${data?.team?.name}"`
  );
  check(
    'embedded team is the invite\'s team',
    data?.team?.id === liveTeam.id,
    `expected ${liveTeam.id}`
  );

  // --- 2. Scope: an expired invite must not expose its team -------------
  if (deadTeam) {
    const { data: deadRead } = await anon.from('teams').select('id').eq('id', deadTeam.id).maybeSingle();
    check(
      'a team whose only invite is expired stays invisible to anon (policy is scoped)',
      deadRead == null,
      `read=${JSON.stringify(deadRead)}`
    );
  } else {
    skip('policy scope negative check', 'every sampled team already has a live invite');
  }

  // --- 3. Scope: anon still cannot write teams -------------------------
  const { error: writeErr } = await anon.from('teams').update({ name: 'probe-should-fail' }).eq('id', liveTeam.id);
  const { data: unchanged } = await admin.from('teams').select('name').eq('id', liveTeam.id).single();
  check(
    'anon cannot update teams (SELECT only)',
    unchanged?.name === liveTeam.name,
    `error=${errText(writeErr)}, name="${unchanged?.name}"`
  );
}

async function cleanup(): Promise<void> {
  if (createdInviteIds.length) {
    await admin.from('invite_codes').delete().in('id', createdInviteIds);
    console.log(`\n── Cleanup: removed ${createdInviteIds.length} fixture invite code(s)`);
  }
}

main()
  .catch((e) => {
    failed++;
    console.error('\nProbe aborted:', e instanceof Error ? e.message : e);
  })
  .finally(async () => {
    await cleanup();
    console.log(`\nResult: ${passed} passed, ${failed} failed, ${skipped} skipped`);
    process.exit(failed === 0 ? 0 : 1);
  });
