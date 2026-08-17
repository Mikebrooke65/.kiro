/**
 * Preservation integration tests — lite user registration RLS fix
 * Spec: .kiro/specs/lite-user-registration-fix/ (task 2)
 *
 * Property 2 (Preservation): Non-Buggy Inputs Behave Identically
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.5, 3.6, 3.8, 3.9**
 * (3.7 is pure client logic and lives in src/lib/invites-api.preservation.test.ts)
 *
 * These are the database-touching preservation cases: their outcome depends on
 * real RLS and real GoTrue behaviour, so they cannot be faked. They MUST pass on
 * unfixed code — that is what makes them a baseline. Task 3.8 re-runs this
 * script unchanged to prove the Edge Function fix regressed none of it.
 *
 * Method: observation first. Every BASELINE assertion below was observed against
 * the unfixed code before being written down.
 *
 * ── BASELINE DEVIATION (recorded deliberately, not an accident) ─────────────
 * Task 1 confirmed the design's baseline caveat: an `anon` SELECT on
 * `public.users` returns `rows=0, error=none` even when the row exists, because
 * no policy grants `anon` SELECT there and RLS filters silently. So requirements
 * 3.1 and 3.2 are NOT behaviour the current code gets right — they are a second
 * latent defect that the move to `service_role` fixes. The checks below record
 * that as DEVIATION observations (visible, non-fatal) rather than pretending the
 * documented behaviour exists today. The documented intent for 3.1 / 3.2 is
 * asserted at decision level in the vitest suite, and end-to-end after the fix.
 *
 * Same root cause reaches two more places, both recorded as DEVIATIONS:
 *   - the expired-code notification to the inviter (3.3) cannot read the
 *     inviter's name as `anon`, so no notification is emitted today;
 *   - `privacy_consent_at` (3.5) can never be written by the anon flow, because
 *     the `users` insert that carries it is the insert RLS rejects. The column's
 *     storage behaviour is asserted directly instead.
 *
 * IMPORTANT — this script deliberately never calls `auth.signUp()`. Task 1 hit
 * `email rate limit exceeded` on this project's auth email quota, and none of the
 * preservation cases need a confirmation email to be sent. Fixture accounts are
 * created with `email_confirm: true` through the admin API, which sends nothing.
 *
 * Throwaway addresses only; every fixture is cleaned up; auth-user deletion is
 * guarded to the `wcr-preserve-*` pattern so it cannot touch a real account.
 *
 * Run: npx tsx scripts/preserve-lite-registration.ts
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Environment (same loader as scripts/explore-lite-registration-bug.ts —
// src/lib/supabase.ts reads import.meta.env and cannot be imported under tsx)
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

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('BLOCKED: missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
  process.exit(2);
}
if (!SERVICE_KEY) {
  console.error('BLOCKED: missing SUPABASE_SERVICE_ROLE_KEY (fixtures, inspection and cleanup only)');
  process.exit(2);
}

/** The role the app uses for validation and registration today. */
const anon: SupabaseClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Fixtures, inspection and cleanup only. Never used for behaviour under test. */
const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Throwaway identities + deletion guard
// ---------------------------------------------------------------------------

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TEST_EMAIL_PREFIX = 'wcr-preserve-';
const TEST_EMAIL_DOMAIN = '@mailinator.com'; // Supabase Auth rejects RFC-2606 reserved domains

function throwawayEmail(label: string): string {
  return `${TEST_EMAIL_PREFIX}${RUN_ID}-${label}${TEST_EMAIL_DOMAIN}`;
}

/** Nothing is deleted unless it is unmistakably a fixture created by this run. */
function isThrowawayEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return e.startsWith(TEST_EMAIL_PREFIX) && e.endsWith(TEST_EMAIL_DOMAIN);
}

function throwawayCode(label: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rest = '';
  for (let i = 0; i < 4; i++) rest += chars.charAt(Math.floor(Math.random() * chars.length));
  return `ZP${label}${rest}`.toUpperCase().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const failures: string[] = [];
const deviations: string[] = [];

function assertBaseline(label: string, ok: boolean, observed: string): void {
  if (ok) {
    console.log(`  ✓ ${label}\n      observed: ${observed}`);
  } else {
    console.log(`  ✗ ${label}\n      observed: ${observed}`);
    failures.push(`${label} — observed: ${observed}`);
  }
}

function recordDeviation(label: string, observed: string, documentedIntent: string): void {
  console.log(`  ! DEVIATION ${label}\n      observed: ${observed}\n      documented intent: ${documentedIntent}`);
  deviations.push(`${label} — observed: ${observed} | documented intent: ${documentedIntent}`);
}

function errText(e: unknown): string {
  if (!e) return 'none';
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e) return String((e as any).message);
  return String(e);
}

// ---------------------------------------------------------------------------
// Mirror of validateInviteCode() — anon client, statement for statement
// ---------------------------------------------------------------------------

type InviteStatus = 'valid' | 'invalid' | 'redeemed' | 'expired';

interface ValidationObservation {
  status: InviteStatus;
  inviteReadByAnon: boolean;
  inviterLookupRows: number | null; // notifyExpiredCodeUsage(), expired path only
  inviterLookupError: string | null;
}

async function mirrorValidateInviteCode(code: string): Promise<ValidationObservation> {
  const out: ValidationObservation = {
    status: 'invalid',
    inviteReadByAnon: false,
    inviterLookupRows: null,
    inviterLookupError: null,
  };

  const { data, error } = await anon
    .from('invite_codes')
    .select('*, team:teams(*)')
    .eq('code', code)
    .single();

  if (error || !data) return out;

  out.inviteReadByAnon = true;

  if (data.redeemed_by) {
    out.status = 'redeemed';
    return out;
  }

  if (new Date(data.expires_at) < new Date()) {
    // Mirror of notifyExpiredCodeUsage(): looks the inviter up in public.users.
    const { data: creator, error: creatorErr } = await anon
      .from('users')
      .select('first_name, last_name')
      .eq('id', data.created_by);
    out.inviterLookupRows = creator?.length ?? 0;
    out.inviterLookupError = creatorErr ? errText(creatorErr) : null;
    out.status = 'expired';
    return out;
  }

  out.status = 'valid';
  return out;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const createdInviteIds: string[] = [];
const createdUsersRowIds: string[] = [];
const createdAuthUserEmails = new Set<string>();

interface Fixtures {
  teamId: string;
  teamAgeGroup: string;
  teamName: string;
  creatorId: string;
  existingEmail: string;
  existingUserId: string;
  consentTimestamp: string;
  validCode: string;
  expiredCode: string;
  redeemedCode: string;
}

async function setup(): Promise<Fixtures> {
  const { data: team, error: teamErr } = await admin
    .from('teams')
    .select('*')
    .not('age_group', 'is', null)
    .limit(1)
    .maybeSingle();
  if (teamErr || !team) throw new Error(`No team available for fixtures: ${errText(teamErr)}`);

  const { data: creator, error: creatorErr } = await admin
    .from('users')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();
  if (creatorErr || !creator) throw new Error(`No admin user for invite.created_by: ${errText(creatorErr)}`);

  const existingEmail = throwawayEmail('existing');
  const consentTimestamp = new Date().toISOString();

  // A throwaway person who ALREADY has an account (3.1) and is ALREADY in the
  // team (3.2), created through the admin API so no confirmation email is sent.
  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email: existingEmail,
    password: 'PreserveBase!2026',
    email_confirm: true,
  });
  if (authErr || !authUser?.user) throw new Error(`Could not create fixture auth user: ${errText(authErr)}`);
  createdAuthUserEmails.add(existingEmail);

  const { error: profileErr } = await admin.from('users').insert({
    id: authUser.user.id,
    email: existingEmail,
    first_name: 'Preserve',
    last_name: 'Existing',
    cellphone: '',
    role: 'player',
    user_type: 'lite',
    active: true,
    privacy_consent_at: consentTimestamp,
  });
  if (profileErr) throw new Error(`Could not create fixture users row: ${errText(profileErr)}`);
  createdUsersRowIds.push(authUser.user.id);

  const { error: memberErr } = await admin
    .from('team_members')
    .insert({ team_id: team.id, user_id: authUser.user.id, role: 'player' });
  if (memberErr) throw new Error(`Could not create fixture team_members row: ${errText(memberErr)}`);

  const inFuture = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();
  const inPast = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const validCode = throwawayCode('A');
  const expiredCode = throwawayCode('B');
  const redeemedCode = throwawayCode('C');

  const rows = [
    { code: validCode, recipient_email: existingEmail, expires_at: inFuture, redeemed_by: null, redeemed_at: null },
    { code: expiredCode, recipient_email: existingEmail, expires_at: inPast, redeemed_by: null, redeemed_at: null },
    {
      code: redeemedCode,
      recipient_email: existingEmail,
      expires_at: inFuture,
      redeemed_by: creator.id,
      redeemed_at: new Date().toISOString(),
    },
  ].map((r) => ({ ...r, team_id: team.id, created_by: creator.id }));

  const { data: invites, error: inviteErr } = await admin.from('invite_codes').insert(rows).select('id');
  if (inviteErr || !invites) throw new Error(`Could not create fixture invite codes: ${errText(inviteErr)}`);
  for (const i of invites) createdInviteIds.push(i.id);

  return {
    teamId: team.id,
    teamAgeGroup: String(team.age_group ?? ''),
    teamName: String(team.name ?? ''),
    creatorId: creator.id,
    existingEmail,
    existingUserId: authUser.user.id,
    consentTimestamp,
    validCode,
    expiredCode,
    redeemedCode,
  };
}

async function cleanup(): Promise<void> {
  console.log('\n── Cleanup ─────────────────────────────────────────────');

  const { data: testUsers } = await admin
    .from('users')
    .select('id, email')
    .like('email', `${TEST_EMAIL_PREFIX}%`);

  for (const u of testUsers ?? []) {
    if (!isThrowawayEmail(u.email)) continue;
    await admin.from('team_members').delete().eq('user_id', u.id);
    await admin.from('invite_codes').update({ redeemed_by: null, redeemed_at: null }).eq('redeemed_by', u.id);
    await admin.from('users').delete().eq('id', u.id);
    console.log(`  removed public.users row ${u.email}`);
  }

  if (createdInviteIds.length) {
    await admin.from('invite_codes').delete().in('id', createdInviteIds);
    console.log(`  removed ${createdInviteIds.length} fixture invite code(s)`);
  }

  for (const email of createdAuthUserEmails) {
    if (!isThrowawayEmail(email)) {
      console.log(`  REFUSED to delete non-throwaway auth user: ${email}`);
      continue;
    }
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`, {
      headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!res.ok) continue;
    const body: any = await res.json();
    const authUser = (body.users ?? []).find((u: any) => (u.email ?? '').toLowerCase() === email.toLowerCase());
    if (!authUser) continue;
    if (!isThrowawayEmail(authUser.email)) {
      console.log(`  REFUSED to delete auth user ${authUser.email} (guard)`);
      continue;
    }
    const { error } = await admin.auth.admin.deleteUser(authUser.id);
    console.log(error ? `  failed to delete auth user ${email}: ${errText(error)}` : `  removed auth user ${email}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════');
  console.log(' Preservation baseline — lite user registration');
  console.log(' Property 2: non-buggy inputs behave identically');
  console.log(' EXPECTED ON UNFIXED CODE: PASS (deviations listed separately)');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Project: ${SUPABASE_URL}`);
  console.log(`Run id: ${RUN_ID}\n`);

  const fx = await setup();
  console.log(`Fixtures: team "${fx.teamAgeGroup} ${fx.teamName}" (${fx.teamId})`);
  console.log(`  existing user   ${fx.existingEmail} (users row + team_members row + privacy_consent_at)`);
  console.log(`  valid code      ${fx.validCode}`);
  console.log(`  expired code    ${fx.expiredCode}`);
  console.log(`  redeemed code   ${fx.redeemedCode}`);

  // --- 3.3 invite code statuses ----------------------------------------
  console.log('\n── 3.3 invite code statuses via the anon flow ──────────');

  const vValid = await mirrorValidateInviteCode(fx.validCode);
  assertBaseline(
    '3.3 an unredeemed, unexpired code validates as valid',
    vValid.status === 'valid',
    `status=${vValid.status}`
  );

  const vExpired = await mirrorValidateInviteCode(fx.expiredCode);
  assertBaseline('3.3 an expired code returns "expired"', vExpired.status === 'expired', `status=${vExpired.status}`);

  const vRedeemed = await mirrorValidateInviteCode(fx.redeemedCode);
  assertBaseline(
    '3.3 an already-redeemed code returns "redeemed"',
    vRedeemed.status === 'redeemed',
    `status=${vRedeemed.status}`
  );

  const vInvalid = await mirrorValidateInviteCode('NOSUCHCODE');
  assertBaseline(
    '3.3 a nonexistent code returns "invalid"',
    vInvalid.status === 'invalid',
    `status=${vInvalid.status}`
  );

  // Expired-code notification to the inviter — same anon-SELECT root cause.
  if (vExpired.inviterLookupRows === 0) {
    recordDeviation(
      '3.3 expired code notifies the inviter',
      `anon lookup of the inviter in public.users returned rows=0 error="${vExpired.inviterLookupError ?? 'none'}", so notifyExpiredCodeUsage() emits nothing today (the status is still "expired")`,
      'the inviter is notified when an expired code is used — reachable once the lookup runs under service_role'
    );
  } else {
    assertBaseline(
      '3.3 expired code reaches the inviter notification path',
      (vExpired.inviterLookupRows ?? 0) > 0,
      `inviter lookup rows=${vExpired.inviterLookupRows}`
    );
  }

  // --- 3.6 anon read of invite_codes (migration 043) --------------------
  console.log('\n── 3.6 anonymous invite_codes read + migrations 043/044 ─');

  const { data: anonInvite, error: anonInviteErr } = await anon
    .from('invite_codes')
    .select('id, code, team_id, expires_at')
    .eq('code', fx.validCode);
  assertBaseline(
    '3.6 an anonymous visitor can read invite_codes',
    (anonInvite?.length ?? 0) === 1 && !anonInviteErr,
    `rows=${anonInvite?.length ?? 0} error="${errText(anonInviteErr)}"`
  );

  const { data: anonTeam, error: anonTeamErr } = await anon
    .from('teams')
    .select('id, name, age_group')
    .eq('id', fx.teamId);
  const { data: anonEmbed } = await anon
    .from('invite_codes')
    .select('code, team:teams(id, name, age_group)')
    .eq('code', fx.validCode)
    .maybeSingle();
  const embeddedTeam = (anonEmbed as any)?.team ?? null;

  if ((anonTeam?.length ?? 0) === 0) {
    // NEW FINDING on this run: migration 043 opened invite_codes to anon but
    // nothing grants anon SELECT on teams, so the `team:teams(*)` embed in
    // validateInviteCode() comes back null for an anonymous visitor.
    recordDeviation(
      '3.6 / 3.8 the team embedded in validateInviteCode() is readable anonymously',
      `anon SELECT on teams returned rows=${anonTeam?.length ?? 0} error="${errText(anonTeamErr)}", and the embedded team on the invite read is ${embeddedTeam ? 'present' : 'null'} — so the invite page heading and success screen render "undefined undefined" for an anonymous visitor today`,
      'the invite page names the team as "{age_group} {name}" (3.8, 2.5) — NOT addressed by the designed fix, because validateInviteCode() stays client-side and anonymous; flag before task 3.3'
    );
  } else {
    assertBaseline(
      '3.6 the embedded team read used by validateInviteCode() works anonymously',
      (anonTeam?.length ?? 0) === 1 && !anonTeamErr && !!embeddedTeam,
      `rows=${anonTeam?.length ?? 0} error="${errText(anonTeamErr)}" embeddedTeam=${embeddedTeam ? 'present' : 'null'}`
    );
  }

  for (const migration of ['043_invite_codes_public_read.sql', '044_users_self_insert.sql']) {
    const path = resolve(projectRoot, 'supabase/migrations', migration);
    assertBaseline(
      `3.6 migration ${migration} is present and unreverted`,
      existsSync(path),
      existsSync(path) ? 'file present' : 'FILE MISSING'
    );
  }

  // --- 3.5 privacy_consent_at ------------------------------------------
  console.log('\n── 3.5 privacy_consent_at capture ─────────────────────');

  const { data: consentRow, error: consentErr } = await admin
    .from('users')
    .select('id, privacy_consent_at')
    .eq('id', fx.existingUserId)
    .maybeSingle();
  assertBaseline(
    '3.5 privacy_consent_at is stored on the users row as given',
    consentRow?.privacy_consent_at != null &&
      new Date(consentRow.privacy_consent_at).getTime() === new Date(fx.consentTimestamp).getTime(),
    `privacy_consent_at=${consentRow?.privacy_consent_at ?? 'null'} error="${errText(consentErr)}"`
  );

  // The anon flow can never reach that column today: the users insert carrying it
  // is exactly the insert RLS rejects. Observed without signUp() to avoid the
  // project's auth email quota.
  const probeId = crypto.randomUUID();
  const { error: anonInsertErr } = await anon.from('users').insert({
    id: probeId,
    email: throwawayEmail('rlsprobe'),
    first_name: 'Preserve',
    last_name: 'RlsProbe',
    cellphone: '',
    role: 'player',
    user_type: 'lite',
    active: true,
    privacy_consent_at: new Date().toISOString(),
  });
  const rlsRejected = /row-level security|violates row-level/i.test(errText(anonInsertErr));
  if (rlsRejected) {
    recordDeviation(
      '3.5 privacy_consent_at written by the registration flow',
      `an anon insert into public.users carrying privacy_consent_at is rejected: "${errText(anonInsertErr)}" — the consent timestamp can never be persisted by the current client flow`,
      'privacy_consent_at is recorded from the consent tick — reachable once the insert runs under service_role'
    );
  } else {
    assertBaseline(
      '3.5 an anon insert into public.users carrying privacy_consent_at succeeds',
      !anonInsertErr,
      `error="${errText(anonInsertErr)}"`
    );
    if (!anonInsertErr) await admin.from('users').delete().eq('id', probeId);
  }

  // --- 3.1 / 3.2 baseline deviation -------------------------------------
  console.log('\n── 3.1 / 3.2 existing-user and membership lookups ──────');

  const { data: anonUserProbe, error: anonUserProbeErr } = await anon
    .from('users')
    .select('id')
    .eq('email', fx.existingEmail);
  const { data: adminUserProbe } = await admin.from('users').select('id').eq('email', fx.existingEmail);

  assertBaseline(
    '3.1 the fixture user really does have a public.users row (service_role sees it)',
    (adminUserProbe?.length ?? 0) === 1,
    `rows=${adminUserProbe?.length ?? 0}`
  );

  if ((anonUserProbe?.length ?? 0) === 0) {
    recordDeviation(
      '3.1 existing user skips account creation and is returned',
      `anon SELECT on public.users for an email that HAS a row returned rows=0 error="${errText(anonUserProbeErr)}" — RLS filters silently, so existingUser is always null and every registrant is pushed into signUp()`,
      'the existing account is reused, only the membership is added — reachable once the lookup runs under service_role'
    );
  } else {
    assertBaseline(
      '3.1 the anon existing-user lookup finds the row',
      (anonUserProbe?.length ?? 0) === 1,
      `rows=${anonUserProbe?.length ?? 0} error="${errText(anonUserProbeErr)}"`
    );
  }

  const { data: anonMemberProbe, error: anonMemberProbeErr } = await anon
    .from('team_members')
    .select('id')
    .eq('team_id', fx.teamId)
    .eq('user_id', fx.existingUserId);
  const { data: adminMemberProbe } = await admin
    .from('team_members')
    .select('id')
    .eq('team_id', fx.teamId)
    .eq('user_id', fx.existingUserId);

  assertBaseline(
    '3.2 the fixture user really is a member of the team (service_role sees it)',
    (adminMemberProbe?.length ?? 0) === 1,
    `rows=${adminMemberProbe?.length ?? 0}`
  );

  if ((anonMemberProbe?.length ?? 0) === 0) {
    recordDeviation(
      '3.2 an existing membership is left alone, no duplicate inserted',
      `anon SELECT on team_members for an existing membership returned rows=0 error="${errText(anonMemberProbeErr)}" — the duplicate-guard lookup is blind under anon, so the current flow would attempt the insert`,
      'the existing team_members row is left alone and no duplicate is inserted — reachable once the check runs under service_role'
    );
  } else {
    assertBaseline(
      '3.2 the anon membership lookup finds the existing row',
      (anonMemberProbe?.length ?? 0) === 1,
      `rows=${anonMemberProbe?.length ?? 0} error="${errText(anonMemberProbeErr)}"`
    );
  }

  // --- 3.8 team name format --------------------------------------------
  console.log('\n── 3.8 team name format from a real team row ───────────');

  // The format itself is the standard `{age_group} {name}` and is asserted on a
  // real team row. Whether the anonymous invite page can SEE that row is the
  // separate deviation recorded under 3.6 above.
  const { data: adminTeam } = await admin.from('teams').select('id, name, age_group').eq('id', fx.teamId).maybeSingle();
  const label = `${adminTeam?.age_group} ${adminTeam?.name}`;
  assertBaseline(
    '3.8 a team row renders as "{age_group} {name}", never the bare name',
    label === `${fx.teamAgeGroup} ${fx.teamName}` && label.trim().length > 0 && label !== fx.teamName,
    `label="${label}"`
  );
  const anonLabel = `${embeddedTeam?.age_group} ${embeddedTeam?.name}`;
  console.log(
    `      note: rendered from the anon embed the same expression yields "${anonLabel}" (see the 3.6 / 3.8 deviation)`
  );

  // --- 3.9 admin create-user path untouched -----------------------------
  console.log('\n── 3.9 admin create-user path (netlify function) ───────');

  const createUserPath = 'netlify/functions/create-user.ts';
  const createUserAbs = resolve(projectRoot, createUserPath);
  assertBaseline('3.9 netlify/functions/create-user.ts exists', existsSync(createUserAbs), 'file present');

  if (existsSync(createUserAbs)) {
    const source = readFileSync(createUserAbs, 'utf8');
    const markers = [
      "userData?.role !== 'admin'",
      'auth.admin.createUser',
      "from('users')",
      'auth.admin.deleteUser',
      "from('team_members')",
    ];
    const missing = markers.filter((m) => !source.includes(m));
    assertBaseline(
      '3.9 its admin check, create, insert, rollback and membership steps are intact',
      missing.length === 0,
      missing.length === 0 ? 'all 5 steps present' : `missing: ${missing.join(', ')}`
    );

    let gitState: string;
    let unmodified: boolean;
    try {
      execFileSync('git', ['diff', '--quiet', 'HEAD', '--', createUserPath], { cwd: projectRoot });
      unmodified = true;
      gitState = 'no diff against HEAD';
    } catch (e: any) {
      unmodified = false;
      gitState = `differs from HEAD (git exit ${e?.status ?? '?'})`;
    }
    assertBaseline('3.9 the file is unmodified relative to git HEAD', unmodified, gitState);
    console.log(
      '      note: not invoked live — it needs Netlify runtime env and an admin JWT, and it creates real auth users'
    );
  }

  // --- Summary ----------------------------------------------------------
  console.log('\n═══════════════════════════════════════════════════════');
  if (deviations.length) {
    console.log(` BASELINE DEVIATIONS RECORDED: ${deviations.length}`);
    console.log(' (documented behaviour that does NOT exist on unfixed code —');
    console.log('  the fix widens to cover these deliberately, not by accident)');
    console.log('═══════════════════════════════════════════════════════');
    for (const d of deviations) console.log(`  ! ${d}`);
    console.log('');
  }

  if (failures.length === 0) {
    console.log(' PROPERTY 2 BASELINE HELD — all preservation assertions passed.');
    console.log(' Re-run unchanged in task 3.8: it must still pass, and the');
    console.log(' deviations above should then be re-checked as fixed behaviour.');
    console.log('═══════════════════════════════════════════════════════');
    return;
  }

  console.log(` PROPERTY 2 BASELINE VIOLATED — ${failures.length} failed assertion(s)`);
  console.log('═══════════════════════════════════════════════════════');
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error('\nUNEXPECTED SCRIPT ERROR:', errText(e));
    process.exitCode = 2;
  })
  .finally(async () => {
    try {
      await cleanup();
    } catch (e) {
      console.error('Cleanup error:', errText(e));
    }
    console.log(
      process.exitCode === 1
        ? '\nRESULT: FAILED — a preservation baseline assertion did not hold'
        : process.exitCode === 2
          ? '\nRESULT: BLOCKED — the script could not complete'
          : '\nRESULT: PASSED on unfixed code (baseline recorded)'
    );
  });
