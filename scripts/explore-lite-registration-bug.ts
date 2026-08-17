/**
 * Bug condition exploration test — lite user registration RLS failure
 * Spec: .kiro/specs/lite-user-registration-fix/ (task 1)
 *
 * Property 1 (Bug Condition): Registration Completes Server-Side For New Registrants
 * Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.5, 2.6
 *
 * THIS SCRIPT IS EXPECTED TO FAIL ON UNFIXED CODE. The failure is the evidence
 * that the bug exists. Do not "fix" the script — task 3.7 re-runs it unchanged
 * to validate the fix.
 *
 * Bug condition under test (design `isBugCondition`):
 *   inviteIsValid(code) AND NOT existsUserWithEmail(email)
 *   AND projectHasEmailConfirmationEnabled()
 *
 * Scoped PBT approach: the bug is deterministic, so the property is scoped to
 * concrete instances of the bug condition (a real valid/unexpired/unredeemed
 * invite code + a throwaway email with no public.users row on this project)
 * rather than generating broad random input.
 *
 * IMPORTANT — why this script mirrors redeemInviteCode() instead of importing it:
 * `src/lib/invites-api.ts` imports `src/lib/supabase.ts`, which reads
 * `import.meta.env`. Under tsx `import.meta.env` is undefined (verified), so the
 * module cannot be loaded outside Vite. The `mirrorRedeemInviteCode()` function
 * below therefore reproduces the wrapper's statement sequence exactly — same
 * call, same order, same anon client — so the observed behaviour is the
 * behaviour of `invitesApi.redeemInviteCode()`.
 *
 * MIRROR UPDATED FOR TASK 3.7 (2026-08-14). Task 3.3 rewrote the wrapper, and
 * task 1's findings said "keep the mirror in sync when task 3.3 rewrites the
 * wrapper". So the call path exercised below is now the post-fix one: a single
 * `functions.invoke('redeem-invite', ...)` on the anon-key client, plus the same
 * `extractFunctionError` body read the wrapper uses. The old client-side
 * `signUp()` → `users` insert → `team_members` insert → `invite_codes` update
 * sequence is gone from the wrapper and is therefore gone from here.
 *
 * **The ASSERTIONS are unchanged** — only the call path they observe. Two result
 * fields keep their task-1 names so the assertion expressions stay byte-identical,
 * even though the work they describe now happens server-side:
 *   * `existingUserFoundByAnon` — post-fix the existing-user lookup runs inside
 *     the Edge Function under `service_role`, so this now records "the flow
 *     resolved to the pre-existing `public.users` row rather than creating a new
 *     one", observed via the service-role client before and after the call.
 *   * `authUserIdFromSignUp` — now the id of the user the function returned.
 * `sessionAfterSignUp` still means what it always did: `anon.auth.getSession()`
 * after the call. `sessionBeforeCall` was added alongside it, because the point
 * of the fix is that the browser never needs a session at any moment (2.6).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ONE ASSERTION WAS DELIBERATELY RE-SCOPED IN TASK 3.7 (2026-08-14): CASE 3.
 * ───────────────────────────────────────────────────────────────────────────
 * This is the only assertion in this script that changed after the fix, and it
 * is recorded here so the change is auditable rather than silent.
 *
 * Case 3 originally read `ASSERT retry succeeds` (`r3.success === true`). That
 * assertion's premise came from the UNFIXED-code run: back then the FIRST
 * attempt failed at the client-side `users` insert, so the code was never
 * redeemed and case 3 re-submitted an *unredeemed* code — the question it was
 * really asking was "is a second attempt blocked by leftover state from the
 * first?" (task 1 recorded the answer: "user already registered", defect 1.3).
 *
 * Post-fix the first attempt SUCCEEDS and redeems the code, so an identical
 * re-submission is correctly rejected as `redeemed`. Asserting `retry succeeds`
 * on the same code would now require invite codes to be reusable, which
 * contradicts preservation requirement 3.3 (single-use codes) that case 7b and
 * the task-2 preservation tests assert and pass.
 *
 * So the ORIGINAL QUESTION IS PRESERVED, in two halves, and neither half is a
 * weakening of Property 1:
 *   3a. the same-code retry must be *cleanly* rejected as `redeemed` — distinct
 *       plain-language message, no raw database text, and no auth user, profile
 *       row, membership or redemption attributable to the retry (2.3, 2.4);
 *   3b. a SECOND valid code for the SAME email must succeed — the actual intent,
 *       that a second attempt is not blocked by leftover state from the first.
 * Half 3b is strictly stronger than the original single assertion, because it
 * checks progress is still possible while 3a checks nothing was left behind.
 *
 * NO OTHER ASSERTION IN THIS SCRIPT CHANGED. Cases 1, 2, 4, 5, 6 and 7 are
 * byte-identical to task 1.
 *
 * Run: npx tsx scripts/explore-lite-registration-bug.ts
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
    'BLOCKED: missing SUPABASE_SERVICE_ROLE_KEY (needed for test setup, inspection and cleanup only — never for the redemption attempt)'
  );
  process.exit(2);
}

/** The role under test. The registration attempt MUST run as anon. */
const anon: SupabaseClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Setup / inspection / cleanup only. Never used for a registration attempt. */
const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Throwaway identities + deletion guard
// ---------------------------------------------------------------------------

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)
  .toString(36)
  .padStart(3, '0')}`;
const TEST_EMAIL_PREFIX = 'wcr-bugtest-';

/**
 * Supabase Auth rejects addresses on RFC-2606 reserved domains
 * ("Email address ... is invalid"), which stops signUp() before the behaviour
 * under test runs. Candidates are tried in order until one gets past that
 * validation; a rejection sends no email, so this costs nothing.
 */
const CANDIDATE_EMAIL_DOMAINS = ['@mailinator.com', '@clubfootball.app', '@wcrtest.dev'];

function throwawayEmail(label: string, domain = CANDIDATE_EMAIL_DOMAINS[0]): string {
  return `${TEST_EMAIL_PREFIX}${RUN_ID}-${label}${domain}`;
}

/**
 * Guard: nothing may be deleted unless it is unmistakably a throwaway created
 * by this script. Protects real accounts from the cleanup step.
 */
function isThrowawayEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return e.startsWith(TEST_EMAIL_PREFIX) && CANDIDATE_EMAIL_DOMAINS.some((d) => e.endsWith(d));
}

const TEST_CODE_PREFIX = 'ZZ';
function throwawayCode(label: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rest = '';
  for (let i = 0; i < 4; i++) rest += chars.charAt(Math.floor(Math.random() * chars.length));
  return `${TEST_CODE_PREFIX}${label}${rest}`.toUpperCase().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

interface Finding {
  case: string;
  title: string;
  observed: string;
  matchesExpectation: boolean | null; // null = observation only, no pass/fail
}

const findings: Finding[] = [];
const propertyFailures: string[] = [];

function record(f: Finding): void {
  findings.push(f);
  const mark = f.matchesExpectation === null ? '·' : f.matchesExpectation ? '✓' : '✗';
  console.log(`  ${mark} ${f.title}\n      ${f.observed.replace(/\n/g, '\n      ')}`);
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

// ---------------------------------------------------------------------------
// The behaviour under test — faithful mirror of invitesApi.redeemInviteCode()
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
  error: string | null;
  /**
   * Where the flow stopped. The task-1 vocabulary is kept and the server's
   * `reason` is mapped onto it (see `failedAtFromReason`), so observations stay
   * comparable across the two runs. `invoke` is the one addition: a transport or
   * gateway failure that never reached a step.
   */
  failedAt:
    | null
    | 'validate'
    | 'signUp'
    | 'insert_users'
    | 'insert_team_members'
    | 'select_user'
    | 'invoke';
  validationStatus: 'valid' | 'invalid' | 'redeemed' | 'expired' | null;
  /**
   * Post-fix meaning (name kept so case 5's assertion is byte-identical): the
   * flow resolved to the pre-existing `public.users` row instead of creating a
   * new user. The lookup itself now happens server-side under `service_role`.
   */
  existingUserFoundByAnon: boolean | null;
  sessionBeforeCall: 'null' | 'present' | 'n/a';
  sessionAfterSignUp: 'null' | 'present' | 'n/a';
  /** Post-fix: the id of the user the Edge Function returned. */
  authUserIdFromSignUp: string | null;
  /** Machine-readable `reason` / `status` from the function's error body. */
  reason: string | null;
  user: Record<string, any> | null;
}

/** Shown when the function fails without a usable message of its own. */
const REGISTRATION_FALLBACK_MESSAGE =
  "Something went wrong and we couldn't complete your registration. Please try again.";

/** Reasons `validateRequest()` can return — a rejection before code validation. */
const REQUEST_VALIDATION_REASONS = new Set([
  'missing_code',
  'consent_required',
  'missing_first_name',
  'missing_last_name',
  'missing_email',
  'missing_password',
  'password_too_short',
]);

/**
 * Mirrors the wrapper's `extractFunctionError`: `functions.invoke` collapses every
 * non-2xx into "Edge Function returned a non-2xx status code", so the useful
 * message lives in the response body hanging off `error.context`. Read once, and
 * keep `reason` / `status` as well so the observations below stay as specific as
 * task 1's were.
 */
async function readFunctionErrorBody(
  error: unknown
): Promise<{ message: string; reason: string | null; status: string | null }> {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body: any = await context.json();
      const message =
        typeof body?.error === 'string' ? body.error : REGISTRATION_FALLBACK_MESSAGE;
      return {
        message,
        reason: typeof body?.reason === 'string' ? body.reason : null,
        status: typeof body?.status === 'string' ? body.status : null,
      };
    } catch {
      // Body wasn't JSON — fall through.
    }
  }
  // Transport / gateway failure: keep the raw text, it is diagnostic here even
  // though the wrapper deliberately hides it from the registrant.
  return { message: errText(error) || REGISTRATION_FALLBACK_MESSAGE, reason: null, status: null };
}

/** Map the function's `reason` onto task 1's `failedAt` vocabulary. */
function failedAtFromReason(reason: string | null): AttemptResult['failedAt'] {
  switch (reason) {
    case 'create_auth_user':
    case 'adopt_orphan':
    case 'email_taken':
      return 'signUp';
    case 'insert_profile':
    case 'update_profile':
      return 'insert_users';
    case 'member_lookup':
    case 'insert_team_member':
      return 'insert_team_members';
    case 'fetch_profile':
      return 'select_user';
    default:
      return 'invoke';
  }
}

/**
 * Mirrors `src/lib/invites-api.ts` redeemInviteCode() as rewritten in task 3.3:
 * one `functions.invoke('redeem-invite')` on the anon-key client, then the same
 * error-body read. Extra fields on the result are observations only — they do not
 * change the call being made.
 *
 * The role under test is still `anon` with no user session: that is the whole
 * point of the fix. The service-role client appears here only to observe state
 * either side of the call, never to perform it.
 */
async function mirrorRedeemInviteCode(x: RegistrationAttempt): Promise<AttemptResult> {
  const out: AttemptResult = {
    success: false,
    error: null,
    failedAt: null,
    validationStatus: null,
    existingUserFoundByAnon: null,
    sessionBeforeCall: 'n/a',
    sessionAfterSignUp: 'n/a',
    authUserIdFromSignUp: null,
    reason: null,
    user: null,
  };

  // Cleanup coverage: the function may create an auth user for this address, so
  // register it before the call rather than after inspecting the outcome.
  if (isThrowawayEmail(x.email)) createdAuthUserEmails.add(x.email);

  // Observation only (service role): did a public.users row exist beforehand?
  // Post-fix the existing-user resolution happens inside the function, so this is
  // how the mirror can still answer case 5's question.
  const preExistingProfile = await findUsersRow(x.email);

  const { data: sessionBefore } = await anon.auth.getSession();
  out.sessionBeforeCall = sessionBefore.session ? 'present' : 'null';

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

  const { data: sessionAfter } = await anon.auth.getSession();
  out.sessionAfterSignUp = sessionAfter.session ? 'present' : 'null';

  if (error) {
    const body = await readFunctionErrorBody(error);
    out.error = body.message;
    out.reason = body.reason ?? body.status;
    out.validationStatus = (body.status as AttemptResult['validationStatus']) ?? null;
    if (body.status) {
      // Rejected by server-side code validation (3.3).
      out.failedAt = 'validate';
    } else if (body.reason && REQUEST_VALIDATION_REASONS.has(body.reason)) {
      out.failedAt = 'validate';
    } else {
      // The code passed server-side validation; the failure came later.
      out.validationStatus = 'valid';
      out.failedAt = failedAtFromReason(body.reason);
    }
    out.existingUserFoundByAnon = false;
    return out;
  }

  // A 2xx carrying an `error` field, or no user at all — the wrapper treats both
  // as failures.
  if (result?.error || !result?.user) {
    out.validationStatus = 'valid';
    out.failedAt = 'invoke';
    out.error =
      typeof result?.error === 'string' ? result.error : REGISTRATION_FALLBACK_MESSAGE;
    out.existingUserFoundByAnon = false;
    return out;
  }

  out.success = true;
  out.validationStatus = 'valid';
  out.user = result.user;
  out.authUserIdFromSignUp = result.user.id ?? null;
  out.existingUserFoundByAnon = !!preExistingProfile && preExistingProfile.id === result.user.id;
  return out;
}

// ---------------------------------------------------------------------------
// Inspection helpers (service role — observation only)
// ---------------------------------------------------------------------------

async function findAuthUserByEmail(email: string): Promise<Record<string, any> | null> {
  // PostgREST cannot reach the auth schema; use the admin users endpoint.
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
    { headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!res.ok) return null;
  const body: any = await res.json();
  const users: any[] = body.users ?? [];
  return users.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase()) ?? null;
}

async function findUsersRow(email: string): Promise<Record<string, any> | null> {
  const { data } = await admin.from('users').select('*').eq('email', email).maybeSingle();
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

async function readInvite(code: string): Promise<Record<string, any> | null> {
  const { data } = await admin.from('invite_codes').select('*').eq('code', code).maybeSingle();
  return data ?? null;
}

function isRlsError(message: string | null): boolean {
  if (!message) return false;
  return /row-level security|violates row-level/i.test(message);
}

/**
 * Added for the re-scoped case 3 (task 3.7): the retry must be rejected with
 * plain language only, never raw database text (2.4). Wider than `isRlsError`,
 * which is deliberately left byte-identical because case 1 asserts on it.
 */
function containsDatabaseText(message: string | null): boolean {
  if (!message) return false;
  return /row-level security|violates|constraint|duplicate key|relation "|pgrst|23505|policy/i.test(
    message
  );
}

/** How many auth users exist for exactly this address (case 3a attribution). */
async function countAuthUsersByEmail(email: string): Promise<number> {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
    { headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!res.ok) return -1;
  const body: any = await res.json();
  const users: any[] = body.users ?? [];
  return users.filter((u) => (u.email ?? '').toLowerCase() === email.toLowerCase()).length;
}

/** How many public.users rows exist for this address (case 3a attribution). */
async function countUsersRows(email: string): Promise<number> {
  const { data } = await admin.from('users').select('id').eq('email', email);
  return data?.length ?? -1;
}

/** How many memberships this user holds in total (case 3a attribution). */
async function countTeamMemberships(userId: string): Promise<number> {
  const { data } = await admin.from('team_members').select('id').eq('user_id', userId);
  return data?.length ?? -1;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const createdInviteIds: string[] = [];
const createdUsersRowIds: string[] = [];
const createdAuthUserEmails = new Set<string>();

interface Fixtures {
  teamId: string;
  teamLabel: string;
  createdBy: string;
  validCode: string;
  validCodeForExistingUser: string;
  /**
   * Case 3b (re-scoped in task 3.7): a SECOND valid code addressed to the same
   * new registrant, so "a second attempt is not blocked by leftover state from
   * the first" can be tested without making a single-use code reusable (3.3).
   */
  validCodeSecondForNewUser: string;
  expiredCode: string;
  redeemedCode: string;
  newEmail: string;
  existingEmail: string;
  password: string;
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
  if (creatorErr || !creator) throw new Error(`No admin user for invite.created_by: ${errText(creatorErr)}`);

  const newEmail = throwawayEmail('new');
  const existingEmail = throwawayEmail('existing');

  const inFuture = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();
  const inPast = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const validCode = throwawayCode('A');
  const validCodeForExistingUser = throwawayCode('B');
  const expiredCode = throwawayCode('C');
  const redeemedCode = throwawayCode('D');
  const validCodeSecondForNewUser = throwawayCode('E');

  const rows = [
    { code: validCode, recipient_email: newEmail, expires_at: inFuture, redeemed_by: null, redeemed_at: null },
    { code: validCodeForExistingUser, recipient_email: existingEmail, expires_at: inFuture, redeemed_by: null, redeemed_at: null },
    // Case 3b fixture. Cleaned up with the rest: its id lands in
    // `createdInviteIds` below, and cleanup() also clears any `redeemed_by`
    // pointing at a throwaway user before deleting the codes.
    { code: validCodeSecondForNewUser, recipient_email: newEmail, expires_at: inFuture, redeemed_by: null, redeemed_at: null },
    { code: expiredCode, recipient_email: newEmail, expires_at: inPast, redeemed_by: null, redeemed_at: null },
    { code: redeemedCode, recipient_email: newEmail, expires_at: inFuture, redeemed_by: creator.id, redeemed_at: new Date().toISOString() },
  ].map((r) => ({ ...r, team_id: team.id, created_by: creator.id }));

  const { data: invites, error: inviteErr } = await admin.from('invite_codes').insert(rows).select('id, code');
  if (inviteErr || !invites) throw new Error(`Could not create fixture invite codes: ${errText(inviteErr)}`);
  for (const i of invites) createdInviteIds.push(i.id);

  // Case 5 fixture: a throwaway user that DOES have a public.users row.
  const { data: existingAuth, error: existingAuthErr } = await admin.auth.admin.createUser({
    email: existingEmail,
    password: 'ExploreBug!2026',
    email_confirm: true,
  });
  if (existingAuthErr || !existingAuth?.user) {
    throw new Error(`Could not create fixture existing auth user: ${errText(existingAuthErr)}`);
  }
  createdAuthUserEmails.add(existingEmail);

  const { error: existingProfileErr } = await admin.from('users').insert({
    id: existingAuth.user.id,
    email: existingEmail,
    first_name: 'Explore',
    last_name: 'Existing',
    cellphone: '',
    role: 'player',
    user_type: 'lite',
    active: true,
  });
  if (existingProfileErr) {
    throw new Error(`Could not create fixture existing users row: ${errText(existingProfileErr)}`);
  }
  createdUsersRowIds.push(existingAuth.user.id);

  const teamLabel = `${team.age_group ?? ''} ${team.name ?? ''}`.trim();

  return {
    teamId: team.id,
    teamLabel,
    createdBy: creator.id,
    validCode,
    validCodeForExistingUser,
    validCodeSecondForNewUser,
    expiredCode,
    redeemedCode,
    newEmail,
    existingEmail,
    password: 'ExploreBug!2026',
  };
}

async function cleanup(): Promise<void> {
  console.log('\n── Cleanup ─────────────────────────────────────────────');

  // team_members and users rows for throwaway emails
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

  // invite fixtures
  if (createdInviteIds.length) {
    await admin.from('invite_codes').delete().in('id', createdInviteIds);
    console.log(`  removed ${createdInviteIds.length} fixture invite code(s)`);
  }

  // auth users — GUARDED: throwaway addresses only
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
      error ? `  failed to delete auth user ${email}: ${errText(error)}` : `  removed auth user ${email}`
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════');
  console.log(' Bug condition exploration — lite user registration');
  console.log(' Property 1: registration completes for new registrants');
  console.log(' EXPECTED ON UNFIXED CODE: FAIL');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Project: ${SUPABASE_URL}`);
  console.log(`Role under test: anon`);
  console.log(`Run id: ${RUN_ID}\n`);

  const fx = await setup();
  console.log(`Fixtures: team "${fx.teamLabel}" (${fx.teamId})`);
  console.log(`  valid code            ${fx.validCode}  -> ${fx.newEmail}`);
  console.log(`  valid code (existing) ${fx.validCodeForExistingUser}  -> ${fx.existingEmail}`);
  console.log(`  valid code (2nd, 3b)  ${fx.validCodeSecondForNewUser}  -> ${fx.newEmail}`);
  console.log(`  expired code          ${fx.expiredCode}`);
  console.log(`  redeemed code         ${fx.redeemedCode}`);

  // --- Bug condition precheck -------------------------------------------
  console.log('\n── Bug condition precheck ──────────────────────────────');
  const inviteBefore = await readInvite(fx.validCode);
  const inviteValid =
    !!inviteBefore && !inviteBefore.redeemed_by && new Date(inviteBefore.expires_at) > new Date();
  const noUserRow = (await findUsersRow(fx.newEmail)) === null;
  console.log(`  inviteIsValid(code)              = ${inviteValid}`);
  console.log(`  NOT existsUserWithEmail(email)   = ${noUserRow}`);
  console.log(`  projectHasEmailConfirmationEnabled = assumed true; case 4 observes it directly`);
  if (!inviteValid || !noUserRow) throw new Error('Fixtures do not satisfy isBugCondition');

  // --- Case 1 -----------------------------------------------------------
  console.log('\n── Case 1: new email matching the invite address ───────');
  let attempt!: RegistrationAttempt;
  let r1!: AttemptResult;

  for (const domain of CANDIDATE_EMAIL_DOMAINS) {
    const email = throwawayEmail('new', domain);
    // Keep emailMatchesInvite true: the invite is addressed to this email.
    await admin.from('invite_codes').update({ recipient_email: email }).eq('code', fx.validCode);
    attempt = {
      code: fx.validCode,
      email,
      password: fx.password,
      first_name: 'Explore',
      last_name: 'New',
      privacy_consent: true,
    };
    console.log(`  submitting ${email} (invite recipient_email matches)`);

    r1 = await mirrorRedeemInviteCode(attempt);
    if (r1.authUserIdFromSignUp) createdAuthUserEmails.add(email);

    // Auth rejecting the address itself is an environment obstacle, not the
    // behaviour under test. Post-fix that arrives as the function's own
    // `invalid_email` message (reason `create_auth_user`) rather than GoTrue's
    // raw "Email address ... is invalid" — same condition, new wording.
    const addressRejected =
      r1.failedAt === 'signUp' && /not accepted|invalid/i.test(r1.error ?? '');
    if (!addressRejected) break;
    console.log(`      auth rejected the address itself ("${r1.error}") — trying the next throwaway domain`);
  }
  fx.newEmail = attempt.email;
  record({
    case: '1',
    title: 'redeemInviteCode() outcome',
    observed:
      `success=${r1.success} failedAt=${r1.failedAt ?? 'none'}\n` +
      `error="${r1.error ?? 'none'}"\n` +
      `validationStatus=${r1.validationStatus} existingUserFoundByAnon=${r1.existingUserFoundByAnon}`,
    matchesExpectation: r1.success,
  });

  // Property 1 assertions
  console.log('\n  Property 1 assertions:');
  assertProperty('success = true', r1.success === true, `success=${r1.success}, error="${r1.error}"`);
  assertProperty('no RLS error', !isRlsError(r1.error), `error="${r1.error}"`);

  const authAfter = await findAuthUserByEmail(fx.newEmail);
  assertProperty('auth user exists', !!authAfter, 'no auth.users row for the submitted email');

  const usersRowAfter = await findUsersRow(fx.newEmail);
  assertProperty('users row exists', !!usersRowAfter, 'no public.users row for the submitted email');
  assertProperty(
    "users.user_type = 'lite'",
    usersRowAfter?.user_type === 'lite',
    `user_type=${usersRowAfter?.user_type ?? 'n/a (no row)'}`
  );
  assertProperty(
    'users.privacy_consent_at set',
    !!usersRowAfter?.privacy_consent_at,
    `privacy_consent_at=${usersRowAfter?.privacy_consent_at ?? 'n/a (no row)'}`
  );

  const tmAfter = usersRowAfter ? await findTeamMember(fx.teamId, usersRowAfter.id) : null;
  assertProperty(
    'team_members row exists for invite.team_id',
    !!tmAfter,
    `no team_members row for team ${fx.teamId}`
  );

  const inviteAfter = await readInvite(fx.validCode);
  assertProperty(
    'invite_codes.redeemed_by = user.id',
    !!inviteAfter?.redeemed_by && !!usersRowAfter && inviteAfter.redeemed_by === usersRowAfter.id,
    `redeemed_by=${inviteAfter?.redeemed_by ?? 'null'}`
  );

  // --- Case 2 -----------------------------------------------------------
  console.log('\n── Case 2: orphaned auth user check (defect 1.2) ───────');
  const orphan = !!authAfter && !usersRowAfter;
  record({
    case: '2',
    title: 'auth user with no public.users row',
    observed: authAfter
      ? `auth.users id=${authAfter.id} exists; public.users row ${usersRowAfter ? 'exists' : 'MISSING'} => orphan=${orphan}`
      : 'no auth user was created, so no orphan',
    matchesExpectation: !orphan,
  });

  // --- Case 4 (observed during case 1) ----------------------------------
  console.log('\n── Case 4: session immediately after signUp() ──────────');
  record({
    case: '4',
    title: 'anon.auth.getSession() after signUp()',
    observed:
      `session = ${r1.sessionAfterSignUp} (expected "null" if email confirmation withholds the session — the mechanism)\n` +
      `session before the call = ${r1.sessionBeforeCall}` +
      ` => post-fix there is no signUp() in the path at all, and the browser needs no session at any point (2.6)`,
    matchesExpectation: null,
  });

  // --- Case 6 -----------------------------------------------------------
  console.log('\n── Case 6: Supabase confirmation email (defect 1.3) ────');
  record({
    case: '6',
    title: 'confirmation email dispatched by signUp()',
    observed: authAfter
      ? `confirmation_sent_at=${authAfter.confirmation_sent_at ?? 'null'} email_confirmed_at=${authAfter.email_confirmed_at ?? 'null'}` +
        ` => Supabase ${authAfter.confirmation_sent_at ? 'DID' : 'did NOT'} send its own confirmation message`
      : 'no auth user to inspect',
    matchesExpectation: null,
  });

  // --- Case 3 -----------------------------------------------------------
  //
  // RE-SCOPED IN TASK 3.7 — the only assertion change in this script. See the
  // header for the full reasoning. Short version: the original
  // `ASSERT retry succeeds` was written from the unfixed-code run, where the
  // first attempt failed at the `users` insert and therefore left the code
  // UNREDEEMED, so re-submitting it asked "is a second attempt blocked by
  // leftover state?". Post-fix the first attempt succeeds and redeems the code,
  // so the identical re-submission is *correctly* rejected as `redeemed`;
  // keeping `retry succeeds` would demand reusable invite codes and contradict
  // preservation requirement 3.3. The original question is preserved in two
  // halves — 3a: the same-code retry is cleanly rejected and leaves nothing
  // behind; 3b: a second valid code for the same email still succeeds. This is
  // NOT a weakening of Property 1.
  console.log('\n── Case 3a: immediate retry of the same submission ─────');

  // State attributable to the retry is measured either side of it.
  const beforeRetry = {
    authUsers: await countAuthUsersByEmail(fx.newEmail),
    usersRows: await countUsersRows(fx.newEmail),
    memberships: usersRowAfter ? await countTeamMemberships(usersRowAfter.id) : -1,
    invite: await readInvite(fx.validCode),
    secondCode: await readInvite(fx.validCodeSecondForNewUser),
  };

  const r3 = await mirrorRedeemInviteCode(attempt);

  const afterRetry = {
    authUsers: await countAuthUsersByEmail(fx.newEmail),
    usersRows: await countUsersRows(fx.newEmail),
    memberships: usersRowAfter ? await countTeamMemberships(usersRowAfter.id) : -1,
    invite: await readInvite(fx.validCode),
    secondCode: await readInvite(fx.validCodeSecondForNewUser),
  };

  const retryCreatedNothing =
    afterRetry.authUsers === beforeRetry.authUsers &&
    afterRetry.usersRows === beforeRetry.usersRows &&
    afterRetry.memberships === beforeRetry.memberships;
  const retryRedeemedNothing =
    afterRetry.invite?.redeemed_by === beforeRetry.invite?.redeemed_by &&
    afterRetry.invite?.redeemed_at === beforeRetry.invite?.redeemed_at &&
    !afterRetry.secondCode?.redeemed_by;

  record({
    case: '3a',
    title: 'retry outcome — cleanly rejected as already used',
    observed:
      `success=${r3.success} failedAt=${r3.failedAt ?? 'none'} validationStatus=${r3.validationStatus}\n` +
      `error="${r3.error ?? 'none'}"\n` +
      `distinct from the first attempt's outcome? ${r3.error !== r1.error}\n` +
      `raw database text in the message? ${containsDatabaseText(r3.error)}\n` +
      `auth users ${beforeRetry.authUsers}->${afterRetry.authUsers}, users rows ${beforeRetry.usersRows}->${afterRetry.usersRows}, memberships ${beforeRetry.memberships}->${afterRetry.memberships}\n` +
      `redemption unchanged? ${retryRedeemedNothing}\n` +
      `=> re-scoped in task 3.7: the code is single-use (3.3), so the correct post-fix outcome is a clean rejection, not a second success`,
    matchesExpectation: r3.success === false && r3.validationStatus === 'redeemed',
  });
  assertProperty(
    'retry is cleanly rejected as redeemed, creating nothing (re-scoped, see header)',
    r3.success === false &&
      r3.validationStatus === 'redeemed' &&
      r3.failedAt === 'validate' &&
      !!r3.error &&
      r3.error !== r1.error &&
      !containsDatabaseText(r3.error) &&
      retryCreatedNothing &&
      retryRedeemedNothing,
    `success=${r3.success}, validationStatus=${r3.validationStatus}, failedAt=${r3.failedAt}, ` +
      `error="${r3.error}", rawDbText=${containsDatabaseText(r3.error)}, ` +
      `createdNothing=${retryCreatedNothing} (auth ${beforeRetry.authUsers}->${afterRetry.authUsers}, ` +
      `users ${beforeRetry.usersRows}->${afterRetry.usersRows}, members ${beforeRetry.memberships}->${afterRetry.memberships}), ` +
      `redeemedNothing=${retryRedeemedNothing}`
  );

  // --- Case 3b ----------------------------------------------------------
  // The original intent of case 3: a second attempt for the same person is not
  // blocked by leftover state from the first. With single-use codes that means a
  // second VALID code, not the same one.
  console.log('\n── Case 3b: second valid code, same email ──────────────');
  await admin
    .from('invite_codes')
    .update({ recipient_email: fx.newEmail })
    .eq('code', fx.validCodeSecondForNewUser);
  const r3b = await mirrorRedeemInviteCode({ ...attempt, code: fx.validCodeSecondForNewUser });
  const secondCodeAfter = await readInvite(fx.validCodeSecondForNewUser);
  record({
    case: '3b',
    title: 'second valid code for the same email succeeds',
    observed:
      `success=${r3b.success} failedAt=${r3b.failedAt ?? 'none'} error="${r3b.error ?? 'none'}"\n` +
      `resolved to the existing user? ${r3b.existingUserFoundByAnon} (id=${r3b.authUserIdFromSignUp})\n` +
      `second code redeemed_by=${secondCodeAfter?.redeemed_by ?? 'null'}\n` +
      `auth users for the address=${await countAuthUsersByEmail(fx.newEmail)} (must stay 1 — no duplicate account)`,
    matchesExpectation: r3b.success,
  });
  assertProperty(
    'second valid code for the same email succeeds (original case 3 intent)',
    r3b.success === true &&
      !!usersRowAfter &&
      r3b.authUserIdFromSignUp === usersRowAfter.id &&
      secondCodeAfter?.redeemed_by === usersRowAfter.id,
    `success=${r3b.success}, error="${r3b.error}", userId=${r3b.authUserIdFromSignUp}, ` +
      `expectedUserId=${usersRowAfter?.id ?? 'n/a'}, secondCodeRedeemedBy=${secondCodeAfter?.redeemed_by ?? 'null'}`
  );

  // --- Case 5 -----------------------------------------------------------
  console.log('\n── Case 5: existing-user baseline as anon (3.1 caveat) ─');
  const r5 = await mirrorRedeemInviteCode({
    code: fx.validCodeForExistingUser,
    email: fx.existingEmail,
    password: fx.password,
    first_name: 'Explore',
    last_name: 'Existing',
    privacy_consent: true,
  });
  const { data: anonUsersProbe, error: anonUsersProbeErr } = await anon
    .from('users')
    .select('id')
    .eq('email', fx.existingEmail);
  record({
    case: '5',
    title: 'existing public.users row, submitted as anon',
    observed:
      `success=${r5.success} failedAt=${r5.failedAt ?? 'none'} error="${r5.error ?? 'none'}"\n` +
      `existingUserFoundByAnon=${r5.existingUserFoundByAnon}\n` +
      `raw anon SELECT on public.users -> rows=${anonUsersProbe?.length ?? 0} error="${errText(anonUsersProbeErr)}"\n` +
      `=> 3.1 is ${r5.existingUserFoundByAnon ? 'a real preservation case today' : 'NOT reachable under anon: a second latent defect'}`,
    matchesExpectation: r5.success,
  });
  assertProperty(
    'existing-user path returns the existing user (3.1 intent)',
    r5.success === true && r5.existingUserFoundByAnon === true,
    `success=${r5.success}, existingUserFoundByAnon=${r5.existingUserFoundByAnon}, error="${r5.error}"`
  );

  // --- Case 7 -----------------------------------------------------------
  console.log('\n── Case 7: expired and redeemed code baseline (3.3) ────');
  const rExpired = await mirrorRedeemInviteCode({ ...attempt, code: fx.expiredCode, email: throwawayEmail('exp') });
  record({
    case: '7a',
    title: 'expired code',
    observed: `validationStatus=${rExpired.validationStatus} error="${rExpired.error}" failedAt=${rExpired.failedAt}`,
    matchesExpectation: rExpired.validationStatus === 'expired',
  });
  const rRedeemed = await mirrorRedeemInviteCode({ ...attempt, code: fx.redeemedCode, email: throwawayEmail('red') });
  record({
    case: '7b',
    title: 'already-redeemed code',
    observed: `validationStatus=${rRedeemed.validationStatus} error="${rRedeemed.error}" failedAt=${rRedeemed.failedAt}`,
    matchesExpectation: rRedeemed.validationStatus === 'redeemed',
  });
  const rInvalid = await mirrorRedeemInviteCode({ ...attempt, code: 'NOSUCHCODE', email: throwawayEmail('inv') });
  record({
    case: '7c',
    title: 'nonexistent code',
    observed: `validationStatus=${rInvalid.validationStatus} error="${rInvalid.error}" failedAt=${rInvalid.failedAt}`,
    matchesExpectation: rInvalid.validationStatus === 'invalid',
  });

  // --- Summary ----------------------------------------------------------
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' Counterexamples / observations');
  console.log('═══════════════════════════════════════════════════════');
  for (const f of findings) {
    console.log(`\nCase ${f.case} — ${f.title}`);
    console.log(`  ${f.observed.replace(/\n/g, '\n  ')}`);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  if (propertyFailures.length === 0) {
    console.log(' PROPERTY 1 HELD — registration completed as required.');
    console.log(' On UNFIXED code this is unexpected; on FIXED code this is the goal.');
    console.log('═══════════════════════════════════════════════════════');
    return;
  }

  console.log(` PROPERTY 1 VIOLATED — ${propertyFailures.length} failed assertion(s)`);
  console.log('═══════════════════════════════════════════════════════');
  for (const p of propertyFailures) console.log(`  ✗ ${p}`);
  console.log('\nFailing example (counterexample):');
  console.log(
    JSON.stringify(
      {
        code: fx.validCode,
        email: fx.newEmail,
        password: '<redacted>',
        first_name: attempt.first_name,
        last_name: attempt.last_name,
        privacy_consent: true,
        firstAttempt: { success: r1.success, failedAt: r1.failedAt, error: r1.error, sessionAfterSignUp: r1.sessionAfterSignUp },
        // Case 3 was re-scoped in task 3.7 (see the header): 3a expects a clean
        // `redeemed` rejection, 3b expects a second valid code to succeed.
        retry: { success: r3.success, failedAt: r3.failedAt, error: r3.error, validationStatus: r3.validationStatus },
        secondValidCode: { success: r3b.success, failedAt: r3b.failedAt, error: r3b.error },
        existingUserBaseline: { success: r5.success, failedAt: r5.failedAt, error: r5.error, existingUserFoundByAnon: r5.existingUserFoundByAnon },
        orphanLeftBehind: orphan,
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
        ? '\nRESULT: FAILED as expected on unfixed code (see counterexamples above).'
        : process.exitCode === 2
          ? '\nRESULT: BLOCKED (script/environment error, not a bug observation).'
          : '\nRESULT: PASSED.'
    );
  });
