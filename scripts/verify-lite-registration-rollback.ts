/**
 * Rollback verification under injected failure — lite user registration
 * Spec: .kiro/specs/lite-user-registration-fix/ (task 4.2)
 *
 * Property 4 (Bug Condition): No Orphan Or Partial State On Failure
 * Validates: Requirements 2.3, 2.4
 *
 * Runs against the live project and the DEPLOYED `redeem-invite` Edge Function.
 * The call under test always goes through the **anon** client, exactly as
 * `invitesApi.redeemInviteCode()` does after task 3.3 — the service-role client
 * appears here only to build fixtures, observe state either side of a call, and
 * clean up.
 *
 * Cases:
 *   1.  Injected failure at the `team_members` insert. Asserts the rollback left
 *       no auth user, no `users` row, no membership and no redemption
 *       attributable to the attempt, and that the message carries no raw
 *       database text (2.3, 2.4).
 *   2.  The same email retried against the same code, injection removed, must
 *       succeed — proving the rollback left nothing blocking (2.3).
 *   3a. Orphan adoption, invited address: an auth user with NO profile row is
 *       adopted (same id reused, no second account) and the submitted password
 *       works via `signInWithPassword`.
 *   3b. Orphan, NON-invited address: refused with the "account already exists"
 *       message rather than adopted — nothing written, and the orphan's original
 *       password still works.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * HOW THE FAILURE IS INJECTED, AND WHY NOT THE WAY THE TASK ASKED FIRST
 * ───────────────────────────────────────────────────────────────────────────
 * Task 4.2's preferred method is an invite row whose `team_id` is a nonexistent
 * UUID, so the membership insert hits a foreign key violation. **That row cannot
 * be created on this project, and no constraint may be added or dropped on the
 * live database.** Probed with the service role before writing this script:
 *
 *   insert into invite_codes (team_id = random uuid)
 *     -> 23503 insert or update on table "invite_codes" violates foreign key
 *        constraint "invite_codes_team_id_fkey"
 *
 * `invite_codes.team_id` is `NOT NULL REFERENCES public.teams(id) ON DELETE
 * CASCADE` (migration 036), so a ghost team cannot be reached from the invite
 * side either: deleting the team cascades the invite away with it.
 *
 * So the same failure is injected from the other end of the same insert. The
 * membership insert has two foreign keys — `team_members_team_id_fkey` and
 * `team_members_user_id_fkey` (migration 021, probed: also 23503) — and the
 * second one is reachable with data alone:
 *
 *   1. Seed a decoy auth user D on a throwaway address, and a `public.users` row
 *      with `id = D` but `email = <the address about to register>`. Legitimate
 *      state: `users.id` references `auth.users(id)`, and `users.email` is
 *      UNIQUE (migration 001) but not required to equal the auth address.
 *   2. Register the target address. `findAuthUserByEmail` matches on the exact
 *      normalised auth address, so D is not found, and a NEW auth user B is
 *      created — the invocation now owns an auth user, which is what the
 *      rollback has to undo.
 *   3. The `users` insert for B hits `duplicate key ... "users_email_key"`. The
 *      handler reads 23505 as migration 006's `on_auth_user_created` trigger
 *      having pre-inserted the row, so it switches to `UPDATE ... WHERE id = B`,
 *      which matches nothing and returns no error, and continues.
 *   4. The `team_members` insert for `user_id = B` therefore violates
 *      `team_members_user_id_fkey`. **The membership insert is the statement
 *      that fails**, which is what the task asks for — the ledger holds an auth
 *      user this invocation created plus a profile row it believes it created,
 *      and the compensations must undo both.
 *
 * `reason: 'insert_team_member'` in the response body is asserted, not assumed:
 * it is the proof that the auth user really was created and the flow really did
 * reach the membership insert, so the absence of that auth user afterwards is
 * rollback having run rather than creation never having happened.
 *
 * Probed on 2026-08-17: migration 006's trigger is NOT live on this project
 * (`auth.admin.createUser` leaves no `public.users` row), which is what makes
 * step 3 land in the duplicate branch and step 4 reachable.
 *
 * SAFETY
 *   * Throwaway addresses only, all `wcr-rollback-<runid>-*@mailinator.com`.
 *     Supabase Auth rejects RFC-2606 domains outright (`@example.com` -> "Email
 *     address is invalid"), recorded in task 1.
 *   * Auth-user deletion is guarded by `isThrowawayEmail()`: the
 *     `wcr-rollback-` prefix AND the `@mailinator.com` domain, checked against
 *     the address on the auth record itself, not just the one we asked for.
 *   * Every fixture is removed in a `finally` block on all exit paths — the
 *     crafted injection row, the invite codes, the seeded orphan and decoy auth
 *     users.
 *   * Leftovers are NOT cleaned up silently: state is measured and asserted
 *     BEFORE cleanup runs, so anything the rollback failed to remove is a
 *     recorded assertion failure first and a cleanup line second.
 *
 * Run: npx tsx scripts/verify-lite-registration-rollback.ts
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');

/** Minimal .env loader so the script is repeatable without extra deps. */
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
  console.error(
    'BLOCKED: missing SUPABASE_SERVICE_ROLE_KEY (fixtures, inspection and cleanup only — never for a registration attempt)'
  );
  process.exit(2);
}

/** The role under test: every registration attempt runs as anon, no session. */
const anon: SupabaseClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Fixtures / inspection / cleanup only. */
const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Throwaway identities + deletion guard
// ---------------------------------------------------------------------------

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)
  .toString(36)
  .padStart(3, '0')}`;
const TEST_EMAIL_PREFIX = 'wcr-rollback-';
const TEST_EMAIL_DOMAIN = '@mailinator.com';

function throwawayEmail(label: string): string {
  return `${TEST_EMAIL_PREFIX}${RUN_ID}-${label}${TEST_EMAIL_DOMAIN}`;
}

/**
 * Guard: nothing is deleted unless it is unmistakably a throwaway created by
 * this script. Protects real accounts from the cleanup step.
 */
function isThrowawayEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return e.startsWith(TEST_EMAIL_PREFIX) && e.endsWith(TEST_EMAIL_DOMAIN);
}

const TEST_CODE_PREFIX = 'ZR';
function throwawayCode(label: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rest = '';
  for (let i = 0; i < 4; i++) rest += chars.charAt(Math.floor(Math.random() * chars.length));
  return `${TEST_CODE_PREFIX}${label}${rest}`.toUpperCase().slice(0, 10);
}

const PASSWORD_SUBMITTED = 'RollbackNew!2026';
const PASSWORD_ORPHAN_ORIGINAL = 'RollbackOld!2026';

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

interface Finding {
  case: string;
  title: string;
  observed: string;
}

const findings: Finding[] = [];
const propertyFailures: string[] = [];

function record(f: Finding): void {
  findings.push(f);
  console.log(`  · ${f.title}\n      ${f.observed.replace(/\n/g, '\n      ')}`);
}

function assertProperty(label: string, ok: boolean, detail: string): void {
  if (ok) {
    console.log(`  ✓ ASSERT ${label}`);
  } else {
    console.log(`  ✗ ASSERT ${label} — ${detail}`);
    propertyFailures.push(`${label}: ${detail}`);
  }
}

function errText(e: unknown): string {
  if (!e) return 'none';
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e) return String((e as any).message);
  return String(e);
}

/**
 * 2.4: no raw database policy or constraint text may reach the registrant.
 * Wider than task 1's `isRlsError` on purpose — a constraint name, an SQLSTATE
 * or a relation name would all be leaks even though none of them mention RLS.
 */
function containsDatabaseText(message: string | null): boolean {
  if (!message) return false;
  return /row-level security|row level security|violates|constraint|duplicate key|foreign key|relation "|pgrst|23503|23505|policy|permission denied|sql/i.test(
    message
  );
}

// ---------------------------------------------------------------------------
// The call under test — the same path `invitesApi.redeemInviteCode()` takes
// ---------------------------------------------------------------------------

interface RegistrationAttempt {
  code: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  privacy_consent: boolean;
}

interface AttemptResult {
  success: boolean;
  /** The plain-language message a registrant would see. */
  error: string | null;
  /** Machine-readable `reason` / `status` from the function's error body. */
  reason: string | null;
  status: string | null;
  httpStatus: number | null;
  user: Record<string, any> | null;
  team: Record<string, any> | null;
  emailConfirmed: boolean | null;
}

/** Shown when the function fails without a usable message of its own. */
const REGISTRATION_FALLBACK_MESSAGE =
  "Something went wrong and we couldn't complete your registration. Please try again.";

/**
 * Mirrors the wrapper's `extractFunctionError`: `functions.invoke` collapses
 * every non-2xx into "Edge Function returned a non-2xx status code", so the
 * useful message lives in the response body hanging off `error.context`.
 */
async function readFunctionErrorBody(
  error: unknown
): Promise<{ message: string; reason: string | null; status: string | null; httpStatus: number | null }> {
  const context = (error as { context?: Response })?.context;
  const httpStatus = typeof context?.status === 'number' ? context.status : null;
  if (context && typeof context.json === 'function') {
    try {
      const body: any = await context.json();
      return {
        message: typeof body?.error === 'string' ? body.error : REGISTRATION_FALLBACK_MESSAGE,
        reason: typeof body?.reason === 'string' ? body.reason : null,
        status: typeof body?.status === 'string' ? body.status : null,
        httpStatus,
      };
    } catch {
      // Body wasn't JSON — fall through.
    }
  }
  return {
    message: errText(error) || REGISTRATION_FALLBACK_MESSAGE,
    reason: null,
    status: null,
    httpStatus,
  };
}

/**
 * One anon-key `functions.invoke('redeem-invite')`, plus the wrapper's error-body
 * read. No session is established at any point (2.6).
 */
async function callRedeemInvite(x: RegistrationAttempt): Promise<AttemptResult> {
  const out: AttemptResult = {
    success: false,
    error: null,
    reason: null,
    status: null,
    httpStatus: null,
    user: null,
    team: null,
    emailConfirmed: null,
  };

  // Cleanup coverage: the function may create an auth user for this address, so
  // register it before the call rather than after inspecting the outcome.
  if (isThrowawayEmail(x.email)) createdAuthUserEmails.add(x.email);

  const { data: result, error } = await anon.functions.invoke('redeem-invite', {
    body: {
      code: x.code,
      email: x.email,
      password: x.password,
      first_name: x.first_name,
      last_name: x.last_name,
      privacy_consent: x.privacy_consent === true,
    },
  });

  if (error) {
    const body = await readFunctionErrorBody(error);
    out.error = body.message;
    out.reason = body.reason ?? body.status;
    out.status = body.status;
    out.httpStatus = body.httpStatus;
    return out;
  }

  if (result?.error || !result?.user) {
    out.error = typeof result?.error === 'string' ? result.error : REGISTRATION_FALLBACK_MESSAGE;
    return out;
  }

  out.success = true;
  out.user = result.user;
  out.team = result.team ?? null;
  out.emailConfirmed = result.email_confirmed ?? null;
  return out;
}

// ---------------------------------------------------------------------------
// Inspection helpers (service role — observation only)
// ---------------------------------------------------------------------------

/** PostgREST cannot reach the `auth` schema; use the admin users endpoint. */
async function listAuthUsersByEmail(email: string): Promise<any[]> {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
    { headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!res.ok) return [];
  const body: any = await res.json();
  const users: any[] = body.users ?? [];
  return users.filter((u) => (u.email ?? '').toLowerCase() === email.toLowerCase());
}

async function findAuthUserByEmail(email: string): Promise<Record<string, any> | null> {
  return (await listAuthUsersByEmail(email))[0] ?? null;
}

async function countAuthUsersByEmail(email: string): Promise<number> {
  return (await listAuthUsersByEmail(email)).length;
}

async function countUsersRowsByEmail(email: string): Promise<number> {
  const { data } = await admin.from('users').select('id').eq('email', email);
  return data?.length ?? -1;
}

async function findUsersRowByEmail(email: string): Promise<Record<string, any> | null> {
  const { data } = await admin.from('users').select('*').eq('email', email).maybeSingle();
  return data ?? null;
}

async function findUsersRowById(id: string): Promise<Record<string, any> | null> {
  const { data } = await admin.from('users').select('*').eq('id', id).maybeSingle();
  return data ?? null;
}

async function findTeamMember(teamId: string, userId: string): Promise<Record<string, any> | null> {
  const { data } = await admin
    .from('team_members')
    .select('*')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle();
  return data ?? null;
}

async function countTeamMembersForTeam(teamId: string): Promise<number> {
  const { data } = await admin.from('team_members').select('id').eq('team_id', teamId);
  return data?.length ?? -1;
}

async function readInvite(code: string): Promise<Record<string, any> | null> {
  const { data } = await admin.from('invite_codes').select('*').eq('code', code).maybeSingle();
  return data ?? null;
}

/** Can this address log in with this password right now? Uses the anon client. */
async function canLogIn(email: string, password: string): Promise<{ ok: boolean; error: string }> {
  const scratch = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await scratch.auth.signInWithPassword({ email, password });
  const ok = !error && !!data?.session;
  if (ok) await scratch.auth.signOut();
  return { ok, error: errText(error) };
}

// ---------------------------------------------------------------------------
// Setup / teardown bookkeeping
// ---------------------------------------------------------------------------

const createdInviteIds: string[] = [];
const createdAuthUserEmails = new Set<string>();

interface Fixtures {
  teamId: string;
  teamLabel: string;
  createdBy: string;
  /** Case 1 + 2: the address the injected failure is aimed at. */
  failEmail: string;
  /** Case 1: the decoy auth user that owns the colliding `users` row. */
  decoyEmail: string;
  decoyAuthUserId: string;
  /** Case 1 + 2: one code, used for the failed attempt and then the retry. */
  failCode: string;
  /** Case 3a: orphan auth user on the INVITED address. */
  orphanEmail: string;
  orphanAuthUserId: string;
  orphanCode: string;
  /** Case 3b: orphan auth user on a NON-invited address. */
  nonInvitedEmail: string;
  nonInvitedAuthUserId: string;
  /** Case 3b: the address the invite is actually addressed to. */
  invitedOtherEmail: string;
  nonInvitedCode: string;
}

async function setup(): Promise<Fixtures> {
  const { data: team, error: teamErr } = await admin
    .from('teams')
    .select('*')
    .limit(1)
    .maybeSingle();
  if (teamErr || !team) throw new Error(`No team available for fixtures: ${errText(teamErr)}`);

  const { data: creator, error: creatorErr } = await admin
    .from('users')
    .select('id, email')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();
  if (creatorErr || !creator) {
    throw new Error(`No admin user for invite.created_by: ${errText(creatorErr)}`);
  }

  const failEmail = throwawayEmail('fail');
  const decoyEmail = throwawayEmail('decoy');
  const orphanEmail = throwawayEmail('orphan');
  const nonInvitedEmail = throwawayEmail('noninvited');
  const invitedOtherEmail = throwawayEmail('invited-other');

  const inFuture = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();
  const failCode = throwawayCode('A');
  const orphanCode = throwawayCode('B');
  const nonInvitedCode = throwawayCode('C');

  const rows = [
    // Cases 1 and 2 share this code: the failed attempt must not burn it, and the
    // retry reusing it is itself part of the evidence (2.3).
    { code: failCode, recipient_email: failEmail, expires_at: inFuture },
    { code: orphanCode, recipient_email: orphanEmail, expires_at: inFuture },
    // Case 3b: addressed to someone else, so the submitted address cannot match.
    { code: nonInvitedCode, recipient_email: invitedOtherEmail, expires_at: inFuture },
  ].map((r) => ({
    ...r,
    team_id: team.id,
    created_by: creator.id,
    redeemed_by: null,
    redeemed_at: null,
  }));

  const { data: invites, error: inviteErr } = await admin
    .from('invite_codes')
    .insert(rows)
    .select('id, code');
  if (inviteErr || !invites) {
    throw new Error(`Could not create fixture invite codes: ${errText(inviteErr)}`);
  }
  for (const i of invites) createdInviteIds.push(i.id);

  // --- Injection fixture (case 1) ---------------------------------------
  // A decoy auth user, plus a `users` row that belongs to it but carries the
  // address about to register. Legitimate state: `users.id` references
  // `auth.users(id)`, and `users.email` is UNIQUE without having to equal the
  // auth address. This is what turns the profile insert into a duplicate-key
  // error and leaves no `users` row for the new auth user, so the `team_members`
  // insert violates `team_members_user_id_fkey`.
  const { data: decoy, error: decoyErr } = await admin.auth.admin.createUser({
    email: decoyEmail,
    password: PASSWORD_ORPHAN_ORIGINAL,
    email_confirm: true,
  });
  if (decoyErr || !decoy?.user) {
    throw new Error(`Could not create decoy auth user: ${errText(decoyErr)}`);
  }
  createdAuthUserEmails.add(decoyEmail);

  const { error: collidingRowErr } = await admin.from('users').insert({
    id: decoy.user.id,
    email: failEmail, // the collision — deliberately not the decoy's auth address
    first_name: 'Rollback',
    last_name: 'Decoy',
    cellphone: '',
    role: 'player',
    user_type: 'lite',
    active: true,
  });
  if (collidingRowErr) {
    throw new Error(`Could not create colliding users row: ${errText(collidingRowErr)}`);
  }

  // --- Orphan fixtures (cases 3a / 3b) ----------------------------------
  // Faithful to a pre-fix orphan (defect 1.2): `signUp()` created the auth user
  // and left it UNCONFIRMED with no profile row, because the `users` insert was
  // the statement RLS rejected.
  const { data: orphan, error: orphanErr } = await admin.auth.admin.createUser({
    email: orphanEmail,
    password: PASSWORD_ORPHAN_ORIGINAL,
    email_confirm: false,
  });
  if (orphanErr || !orphan?.user) {
    throw new Error(`Could not create orphan auth user: ${errText(orphanErr)}`);
  }
  createdAuthUserEmails.add(orphanEmail);

  // Case 3b's auth user is created CONFIRMED, so "the original password still
  // works" is observable after the refusal — an unconfirmed account cannot log in
  // for a reason that has nothing to do with adoption.
  const { data: nonInvited, error: nonInvitedErr } = await admin.auth.admin.createUser({
    email: nonInvitedEmail,
    password: PASSWORD_ORPHAN_ORIGINAL,
    email_confirm: true,
  });
  if (nonInvitedErr || !nonInvited?.user) {
    throw new Error(`Could not create non-invited auth user: ${errText(nonInvitedErr)}`);
  }
  createdAuthUserEmails.add(nonInvitedEmail);

  // Both must really be orphans for the case to mean anything.
  for (const [label, id] of [
    ['orphan', orphan.user.id],
    ['non-invited', nonInvited.user.id],
  ] as const) {
    const row = await findUsersRowById(id);
    if (row) throw new Error(`Fixture ${label} auth user is not an orphan: users row ${row.id} exists`);
  }

  return {
    teamId: team.id,
    teamLabel: `${team.age_group ?? ''} ${team.name ?? ''}`.trim(),
    createdBy: creator.id,
    failEmail,
    decoyEmail,
    decoyAuthUserId: decoy.user.id,
    failCode,
    orphanEmail,
    orphanAuthUserId: orphan.user.id,
    orphanCode,
    nonInvitedEmail,
    nonInvitedAuthUserId: nonInvited.user.id,
    invitedOtherEmail,
    nonInvitedCode,
  };
}

async function cleanup(): Promise<void> {
  console.log('\n── Cleanup ─────────────────────────────────────────────');

  // `users` rows and memberships for throwaway addresses. Assertions have
  // already run, so anything removed here was recorded first.
  const { data: testUsers } = await admin
    .from('users')
    .select('id, email')
    .like('email', `${TEST_EMAIL_PREFIX}%`);

  for (const u of testUsers ?? []) {
    if (!isThrowawayEmail(u.email)) continue;
    await admin.from('team_members').delete().eq('user_id', u.id);
    await admin
      .from('invite_codes')
      .update({ redeemed_by: null, redeemed_at: null })
      .eq('redeemed_by', u.id);
    await admin.from('users').delete().eq('id', u.id);
    console.log(`  removed public.users row ${u.email}`);
  }

  if (createdInviteIds.length) {
    await admin.from('invite_codes').delete().in('id', createdInviteIds);
    console.log(`  removed ${createdInviteIds.length} fixture invite code(s)`);
  }

  // Auth users — GUARDED: throwaway addresses only, checked against the address
  // on the auth record itself.
  for (const email of createdAuthUserEmails) {
    if (!isThrowawayEmail(email)) {
      console.log(`  REFUSED to delete non-throwaway auth user: ${email}`);
      continue;
    }
    const authUser = await findAuthUserByEmail(email);
    if (!authUser) continue;
    if (!isThrowawayEmail(authUser.email)) {
      console.log(`  REFUSED to delete auth user ${authUser.email} (guard)`);
      continue;
    }
    const { error } = await admin.auth.admin.deleteUser(authUser.id);
    console.log(
      error
        ? `  failed to delete auth user ${email}: ${errText(error)}`
        : `  removed auth user ${email}`
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════');
  console.log(' Rollback verification under injected failure (task 4.2)');
  console.log(' Property 4: no orphan or partial state on failure');
  console.log(' EXPECTED ON FIXED CODE: PASS');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Project: ${SUPABASE_URL}`);
  console.log(`Role under test: anon (no session)`);
  console.log(`Run id: ${RUN_ID}\n`);

  const fx = await setup();
  console.log(`Fixtures: team "${fx.teamLabel}" (${fx.teamId})`);
  console.log(`  fail/retry code   ${fx.failCode}  -> ${fx.failEmail}`);
  console.log(`  orphan code       ${fx.orphanCode}  -> ${fx.orphanEmail}`);
  console.log(`  non-invited code  ${fx.nonInvitedCode}  -> ${fx.invitedOtherEmail} (submitting ${fx.nonInvitedEmail})`);
  console.log(`  injection         users row ${fx.failEmail} owned by decoy auth user ${fx.decoyAuthUserId}`);

  // =========================================================================
  // Case 1 — injected failure at the `team_members` insert
  // =========================================================================
  console.log('\n── Case 1: forced failure at the team_members insert ───');

  const attempt: RegistrationAttempt = {
    code: fx.failCode,
    email: fx.failEmail,
    password: PASSWORD_SUBMITTED,
    first_name: 'Rollback',
    last_name: 'Fail',
    privacy_consent: true,
  };

  const before = {
    authUsers: await countAuthUsersByEmail(fx.failEmail),
    usersRows: await countUsersRowsByEmail(fx.failEmail),
    teamMembers: await countTeamMembersForTeam(fx.teamId),
    invite: await readInvite(fx.failCode),
  };

  const r1 = await callRedeemInvite(attempt);

  const after = {
    authUsers: await countAuthUsersByEmail(fx.failEmail),
    usersRows: await countUsersRowsByEmail(fx.failEmail),
    teamMembers: await countTeamMembersForTeam(fx.teamId),
    invite: await readInvite(fx.failCode),
  };

  // The one `users` row for this address must still be the decoy's fixture row,
  // untouched — the handler's blind `UPDATE ... WHERE id = <new user>` must not
  // have rewritten someone else's row either.
  const survivingRow = await findUsersRowByEmail(fx.failEmail);

  record({
    case: '1',
    title: 'injected failure outcome',
    observed:
      `success=${r1.success} httpStatus=${r1.httpStatus} reason=${r1.reason ?? 'none'}\n` +
      `message="${r1.error ?? 'none'}"\n` +
      `raw database text in the message? ${containsDatabaseText(r1.error)}\n` +
      `auth users ${before.authUsers}->${after.authUsers}, users rows ${before.usersRows}->${after.usersRows}, ` +
      `team members (team) ${before.teamMembers}->${after.teamMembers}\n` +
      `invite redeemed_by ${before.invite?.redeemed_by ?? 'null'}->${after.invite?.redeemed_by ?? 'null'}, ` +
      `redeemed_at ${before.invite?.redeemed_at ?? 'null'}->${after.invite?.redeemed_at ?? 'null'}\n` +
      `surviving users row for the address: id=${survivingRow?.id ?? 'none'} ` +
      `(decoy=${fx.decoyAuthUserId}) first_name=${survivingRow?.first_name ?? 'n/a'}`,
  });

  assertProperty(
    'the attempt failed',
    r1.success === false,
    `success=${r1.success} — the injection did not take effect, so nothing about rollback was exercised`
  );
  assertProperty(
    'the failure was the team_members insert (so an auth user had been created)',
    r1.reason === 'insert_team_member',
    `reason=${r1.reason ?? 'none'} — expected 'insert_team_member'; a different step means the injection moved and this case no longer tests the membership insert`
  );
  assertProperty(
    'no auth user left behind for the submitted email',
    after.authUsers === 0,
    `auth users for ${fx.failEmail}: ${before.authUsers}->${after.authUsers} (rollback should have deleted the one it created)`
  );
  assertProperty(
    'no users row attributable to the attempt',
    after.usersRows === before.usersRows && after.usersRows === 1,
    `users rows for the address ${before.usersRows}->${after.usersRows} (1 expected: the decoy fixture row only)`
  );
  assertProperty(
    "the pre-existing users row was not modified",
    survivingRow?.id === fx.decoyAuthUserId && survivingRow?.first_name === 'Rollback' && survivingRow?.last_name === 'Decoy',
    `surviving row id=${survivingRow?.id ?? 'none'} name="${survivingRow?.first_name} ${survivingRow?.last_name}" — expected the untouched decoy row ${fx.decoyAuthUserId}`
  );
  assertProperty(
    'no team_members row attributable to the attempt',
    after.teamMembers === before.teamMembers,
    `team members for team ${fx.teamId}: ${before.teamMembers}->${after.teamMembers}`
  );
  assertProperty(
    'no invite redemption attributable to the attempt',
    !after.invite?.redeemed_by && !after.invite?.redeemed_at,
    `redeemed_by=${after.invite?.redeemed_by ?? 'null'} redeemed_at=${after.invite?.redeemed_at ?? 'null'}`
  );
  assertProperty(
    'the message contains no raw database policy or constraint text (2.4)',
    !!r1.error && !containsDatabaseText(r1.error),
    `message="${r1.error}" rawDbText=${containsDatabaseText(r1.error)}`
  );

  // =========================================================================
  // Case 2 — retry with the same email, injection removed
  // =========================================================================
  console.log('\n── Case 2: otherwise-valid retry, same email ───────────');

  // Remove the injection, exactly as a temporary constraint would be dropped.
  // Nothing else is touched: the invite is the SAME row, still unredeemed, and
  // the address is the same one the failed attempt used.
  await admin.from('users').delete().eq('id', fx.decoyAuthUserId).eq('email', fx.failEmail);
  const injectionGone = (await countUsersRowsByEmail(fx.failEmail)) === 0;
  console.log(`  injection removed (colliding users row deleted): ${injectionGone}`);

  const r2 = await callRedeemInvite(attempt);

  const retryAuthUsers = await countAuthUsersByEmail(fx.failEmail);
  const retryProfile = await findUsersRowByEmail(fx.failEmail);
  const retryMember = retryProfile ? await findTeamMember(fx.teamId, retryProfile.id) : null;
  const retryInvite = await readInvite(fx.failCode);

  record({
    case: '2',
    title: 'retry after rollback',
    observed:
      `success=${r2.success} reason=${r2.reason ?? 'none'} message="${r2.error ?? 'none'}"\n` +
      `auth users for the address=${retryAuthUsers} (1 expected — the rolled-back one is gone, not colliding)\n` +
      `users row id=${retryProfile?.id ?? 'none'} user_type=${retryProfile?.user_type ?? 'n/a'} ` +
      `privacy_consent_at=${retryProfile?.privacy_consent_at ?? 'null'}\n` +
      `team_members row=${retryMember ? 'present' : 'MISSING'} invite redeemed_by=${retryInvite?.redeemed_by ?? 'null'}`,
  });

  assertProperty(
    'the retry with the same email succeeds (nothing was left blocking it)',
    r2.success === true,
    `success=${r2.success} reason=${r2.reason ?? 'none'} message="${r2.error}"`
  );
  assertProperty(
    'exactly one auth user for the address after the retry',
    retryAuthUsers === 1,
    `auth users=${retryAuthUsers}`
  );
  assertProperty(
    'the retry completed all four writes',
    !!retryProfile &&
      retryProfile.user_type === 'lite' &&
      !!retryProfile.privacy_consent_at &&
      !!retryMember &&
      retryInvite?.redeemed_by === retryProfile.id,
    `profile=${retryProfile?.id ?? 'none'} user_type=${retryProfile?.user_type ?? 'n/a'} ` +
      `consent=${retryProfile?.privacy_consent_at ?? 'null'} member=${!!retryMember} ` +
      `redeemed_by=${retryInvite?.redeemed_by ?? 'null'}`
  );

  // =========================================================================
  // Case 3a — orphan adoption, invited address
  // =========================================================================
  console.log('\n── Case 3a: orphan adopted (invited address) ───────────');

  const orphanBefore = {
    authUsers: await countAuthUsersByEmail(fx.orphanEmail),
    usersRow: await findUsersRowById(fx.orphanAuthUserId),
    submittedPasswordWorks: (await canLogIn(fx.orphanEmail, PASSWORD_SUBMITTED)).ok,
  };

  const r3a = await callRedeemInvite({
    code: fx.orphanCode,
    email: fx.orphanEmail,
    password: PASSWORD_SUBMITTED,
    first_name: 'Rollback',
    last_name: 'Orphan',
    privacy_consent: true,
  });

  const orphanAuthUsersAfter = await countAuthUsersByEmail(fx.orphanEmail);
  const orphanProfile = await findUsersRowById(fx.orphanAuthUserId);
  const orphanMember = await findTeamMember(fx.teamId, fx.orphanAuthUserId);
  const orphanInvite = await readInvite(fx.orphanCode);
  const orphanLogin = await canLogIn(fx.orphanEmail, PASSWORD_SUBMITTED);

  record({
    case: '3a',
    title: 'orphan auth user on the invited address is adopted',
    observed:
      `success=${r3a.success} message="${r3a.error ?? 'none'}" email_confirmed=${r3a.emailConfirmed}\n` +
      `seeded orphan id=${fx.orphanAuthUserId}, returned user id=${r3a.user?.id ?? 'none'} ` +
      `=> same auth user reused? ${r3a.user?.id === fx.orphanAuthUserId}\n` +
      `auth users for the address ${orphanBefore.authUsers}->${orphanAuthUsersAfter} (must stay 1 — no second account)\n` +
      `profile row ${orphanBefore.usersRow ? 'existed' : 'absent'} -> ${orphanProfile ? `id=${orphanProfile.id} user_type=${orphanProfile.user_type}` : 'MISSING'}\n` +
      `membership=${orphanMember ? 'present' : 'MISSING'} invite redeemed_by=${orphanInvite?.redeemed_by ?? 'null'}\n` +
      `submitted password worked before adoption? ${orphanBefore.submittedPasswordWorks} — after? ${orphanLogin.ok} ` +
      `(login error "${orphanLogin.error}")`,
  });

  assertProperty(
    'the orphan is adopted, not refused',
    r3a.success === true,
    `success=${r3a.success} reason=${r3a.reason ?? 'none'} message="${r3a.error}"`
  );
  assertProperty(
    'the same auth user id is reused',
    r3a.user?.id === fx.orphanAuthUserId,
    `returned=${r3a.user?.id ?? 'none'} seeded=${fx.orphanAuthUserId}`
  );
  assertProperty(
    'no second account was created for the address',
    orphanAuthUsersAfter === 1,
    `auth users for ${fx.orphanEmail}: ${orphanBefore.authUsers}->${orphanAuthUsersAfter}`
  );
  assertProperty(
    'the adoption completed the profile row, membership and redemption',
    !!orphanProfile &&
      orphanProfile.user_type === 'lite' &&
      !!orphanProfile.privacy_consent_at &&
      !!orphanMember &&
      orphanInvite?.redeemed_by === fx.orphanAuthUserId,
    `profile=${orphanProfile?.id ?? 'none'} user_type=${orphanProfile?.user_type ?? 'n/a'} ` +
      `consent=${orphanProfile?.privacy_consent_at ?? 'null'} member=${!!orphanMember} ` +
      `redeemed_by=${orphanInvite?.redeemed_by ?? 'null'}`
  );
  assertProperty(
    'the submitted password works via signInWithPassword',
    orphanLogin.ok === true,
    `signInWithPassword error="${orphanLogin.error}"`
  );

  // =========================================================================
  // Case 3b — orphan on a NON-invited address must be refused, not adopted
  // =========================================================================
  console.log('\n── Case 3b: non-invited address refused ────────────────');

  const nonInvitedBefore = {
    authUsers: await countAuthUsersByEmail(fx.nonInvitedEmail),
    usersRow: await findUsersRowById(fx.nonInvitedAuthUserId),
    teamMembers: await countTeamMembersForTeam(fx.teamId),
  };

  const r3b = await callRedeemInvite({
    code: fx.nonInvitedCode,
    email: fx.nonInvitedEmail, // NOT the invite's recipient_email
    password: PASSWORD_SUBMITTED,
    first_name: 'Rollback',
    last_name: 'NonInvited',
    privacy_consent: true,
  });

  const nonInvitedAfter = {
    authUsers: await countAuthUsersByEmail(fx.nonInvitedEmail),
    usersRow: await findUsersRowById(fx.nonInvitedAuthUserId),
    member: await findTeamMember(fx.teamId, fx.nonInvitedAuthUserId),
    teamMembers: await countTeamMembersForTeam(fx.teamId),
    invite: await readInvite(fx.nonInvitedCode),
  };

  // The refusal must not have quietly taken the account over: the original
  // password must still work and the submitted one must not.
  const originalPasswordStillWorks = await canLogIn(fx.nonInvitedEmail, PASSWORD_ORPHAN_ORIGINAL);
  const submittedPasswordWorks = await canLogIn(fx.nonInvitedEmail, PASSWORD_SUBMITTED);

  record({
    case: '3b',
    title: 'auth user on a non-invited address is refused, not adopted',
    observed:
      `success=${r3b.success} httpStatus=${r3b.httpStatus} reason=${r3b.reason ?? 'none'}\n` +
      `message="${r3b.error ?? 'none'}"\n` +
      `raw database text in the message? ${containsDatabaseText(r3b.error)}\n` +
      `invite recipient_email=${fx.invitedOtherEmail}, submitted=${fx.nonInvitedEmail} (no match, so adoption is not allowed)\n` +
      `auth users ${nonInvitedBefore.authUsers}->${nonInvitedAfter.authUsers}, ` +
      `profile row ${nonInvitedBefore.usersRow ? 'existed' : 'absent'}->${nonInvitedAfter.usersRow ? 'PRESENT' : 'absent'}, ` +
      `membership=${nonInvitedAfter.member ? 'PRESENT' : 'absent'}, ` +
      `team members ${nonInvitedBefore.teamMembers}->${nonInvitedAfter.teamMembers}\n` +
      `invite redeemed_by=${nonInvitedAfter.invite?.redeemed_by ?? 'null'}\n` +
      `original password still works? ${originalPasswordStillWorks.ok}; submitted password works? ${submittedPasswordWorks.ok}`,
  });

  assertProperty(
    'the attempt is refused',
    r3b.success === false,
    `success=${r3b.success} — a non-invited address must never adopt an existing auth user`
  );
  assertProperty(
    'the refusal is the "account already exists" message',
    !!r3b.error && /account already exists/i.test(r3b.error) && /log ?g?ing in/i.test(r3b.error),
    `message="${r3b.error}" reason=${r3b.reason ?? 'none'} httpStatus=${r3b.httpStatus}`
  );
  assertProperty(
    'the refusal message contains no raw database policy or constraint text (2.4)',
    !!r3b.error && !containsDatabaseText(r3b.error),
    `message="${r3b.error}"`
  );
  assertProperty(
    'nothing was written for the refused attempt',
    nonInvitedAfter.authUsers === nonInvitedBefore.authUsers &&
      !nonInvitedAfter.usersRow &&
      !nonInvitedAfter.member &&
      nonInvitedAfter.teamMembers === nonInvitedBefore.teamMembers &&
      !nonInvitedAfter.invite?.redeemed_by,
    `auth users ${nonInvitedBefore.authUsers}->${nonInvitedAfter.authUsers}, ` +
      `profile=${nonInvitedAfter.usersRow ? 'present' : 'absent'}, member=${!!nonInvitedAfter.member}, ` +
      `team members ${nonInvitedBefore.teamMembers}->${nonInvitedAfter.teamMembers}, ` +
      `redeemed_by=${nonInvitedAfter.invite?.redeemed_by ?? 'null'}`
  );
  assertProperty(
    'the existing account was not taken over (original password still works, submitted one does not)',
    originalPasswordStillWorks.ok === true && submittedPasswordWorks.ok === false,
    `originalWorks=${originalPasswordStillWorks.ok} (error "${originalPasswordStillWorks.error}"), ` +
      `submittedWorks=${submittedPasswordWorks.ok}`
  );

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' Observations');
  console.log('═══════════════════════════════════════════════════════');
  for (const f of findings) {
    console.log(`\nCase ${f.case} — ${f.title}`);
    console.log(`  ${f.observed.replace(/\n/g, '\n  ')}`);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  if (propertyFailures.length === 0) {
    console.log(' PROPERTY 4 HELD — rollback left nothing behind, the message');
    console.log(' stayed plain, the retry succeeded, and orphan adoption is');
    console.log(' allowed only for the invited address.');
    console.log('═══════════════════════════════════════════════════════');
    return;
  }

  console.log(` PROPERTY 4 VIOLATED — ${propertyFailures.length} failed assertion(s)`);
  console.log('═══════════════════════════════════════════════════════');
  for (const p of propertyFailures) console.log(`  ✗ ${p}`);
  console.log('\nFailing example (counterexample):');
  console.log(
    JSON.stringify(
      {
        injectedFailure: {
          code: fx.failCode,
          email: fx.failEmail,
          password: '<redacted>',
          success: r1.success,
          reason: r1.reason,
          message: r1.error,
          leftBehind: {
            authUsers: after.authUsers,
            usersRowsForEmail: after.usersRows,
            teamMembersForTeam: `${before.teamMembers}->${after.teamMembers}`,
            inviteRedeemedBy: after.invite?.redeemed_by ?? null,
          },
        },
        retry: { success: r2.success, reason: r2.reason, message: r2.error },
        orphanAdoption: {
          success: r3a.success,
          reusedSeededId: r3a.user?.id === fx.orphanAuthUserId,
          submittedPasswordWorks: orphanLogin.ok,
        },
        nonInvitedRefusal: {
          success: r3b.success,
          message: r3b.error,
          profileCreated: !!nonInvitedAfter.usersRow,
          originalPasswordStillWorks: originalPasswordStillWorks.ok,
        },
      },
      null,
      2
    )
  );
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
        ? '\nRESULT: FAILED — rollback or orphan handling did not hold (see counterexample above).'
        : process.exitCode === 2
          ? '\nRESULT: BLOCKED (script/environment error, not a behaviour observation).'
          : '\nRESULT: PASSED.'
    );
  });
