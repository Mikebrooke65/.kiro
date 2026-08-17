/**
 * Integration verification — lite user registration end to end
 * Spec: .kiro/specs/lite-user-registration-fix/ (task 4.1)
 *
 * Property 3 (Bug Condition): Pre-Confirmation Follows The Email Match
 * Validates: Requirements 2.2, 2.5, 2.6, 2.7, 2.8, 3.1, 3.4
 *
 * This runs against the LIVE project with the fix deployed (`redeem-invite`
 * ACTIVE, migration 045 applied). It is a verification script, not an
 * exploration script: every assertion is expected to PASS.
 *
 * What it proves that task 3.7 did not:
 *   * the NON-MATCHING email half of Property 3 — registration and membership
 *     still complete, the account is NOT pre-confirmed, and login is actually
 *     refused by Supabase until confirmation (2.8);
 *   * the matching half is proven by really calling `signInWithPassword`, not by
 *     reading `email_confirmed_at` alone (2.7);
 *   * `getSession()` is null before, DURING (polled while the call is in flight)
 *     and after the successful call (2.6);
 *   * supabase-js requests the ABSOLUTE
 *     `https://<project-ref>.supabase.co/functions/v1/redeem-invite`, observed
 *     from the client's own fetch, not assumed — this is why D1 chose an Edge
 *     Function and what makes the Capacitor/Android wrapper work, where a
 *     relative app-origin path would resolve to the local webview origin;
 *   * a Copy Link delivery redeems identically to an emailed link (3.4);
 *   * an undeployed function fails loudly with plain language and no gateway text.
 *
 * WHY IT MIRRORS `redeemInviteCode()` INSTEAD OF IMPORTING IT: `src/lib/invites-api.ts`
 * imports `src/lib/supabase.ts`, which reads `import.meta.env` — undefined under
 * tsx (recorded in task 1). `callRedeemInvite()` below reproduces the wrapper's
 * body statement for statement: one `functions.invoke` on an anon-key client with
 * exactly the same payload keys, and the same `extractFunctionError` body read
 * with the same fallback message.
 *
 * NOT RUN LIVE, VERIFIED BY INSPECTION INSTEAD: Send Link / Resend Link. Sending
 * consumes the project's SMTP/auth email quota — the same quota that blocked task
 * 1 with `email rate limit exceeded`. Case 3b asserts the send path's structure in
 * source instead and says so in the output.
 *
 * SAFETY: throwaway `wcr-int41-*@mailinator.com` addresses only (Supabase Auth
 * rejects RFC-2606 domains such as example.com), every fixture removed on all
 * exit paths, and auth-user deletion guarded to that prefix plus a known
 * throwaway domain so it can never touch a real account.
 *
 * Run: npx tsx scripts/verify-lite-registration-integration.ts
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
    'BLOCKED: missing SUPABASE_SERVICE_ROLE_KEY (fixtures, inspection and cleanup only — never the registration call)'
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Clients — the anon client records every URL supabase-js actually requests
// ---------------------------------------------------------------------------

interface LoggedRequest {
  method: string;
  url: string;
}

const requestLog: LoggedRequest[] = [];

/**
 * Wraps global fetch so the resolved URL supabase-js requests can be read back.
 * The Functions URL claim in task 4.1 has to be observed, not assumed.
 */
const recordingFetch: typeof fetch = (input: any, init?: any) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : typeof input?.url === 'string'
          ? input.url
          : String(input);
  const method = (init?.method ?? input?.method ?? 'GET').toString().toUpperCase();
  requestLog.push({ method, url });
  return fetch(input, init);
};

/** The role under test: anon, no user session, exactly like the browser. */
const anon: SupabaseClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: recordingFetch },
});

/** Fixtures, inspection and cleanup only. Never performs a registration. */
const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Login attempts get their own client so the client under test keeps a null
 * session throughout — a successful sign-in must not be what makes case 1's
 * "session null after" assertion interesting.
 */
function freshLoginClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------------------
// Throwaway identities + deletion guard
// ---------------------------------------------------------------------------

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)
  .toString(36)
  .padStart(3, '0')}`;
const TEST_EMAIL_PREFIX = 'wcr-int41-';

/** Supabase Auth rejects RFC-2606 reserved domains outright (task 1 finding). */
const THROWAWAY_DOMAINS = ['@mailinator.com'];

function throwawayEmail(label: string): string {
  return `${TEST_EMAIL_PREFIX}${RUN_ID}-${label}${THROWAWAY_DOMAINS[0]}`;
}

/** Guard: nothing is deletable unless it is unmistakably this run's fixture. */
function isThrowawayEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return e.startsWith(TEST_EMAIL_PREFIX) && THROWAWAY_DOMAINS.some((d) => e.endsWith(d));
}

const TEST_CODE_PREFIX = 'ZI';
function throwawayCode(label: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rest = '';
  for (let i = 0; i < 4; i++) rest += chars.charAt(Math.floor(Math.random() * chars.length));
  return `${TEST_CODE_PREFIX}${label}${rest}`.toUpperCase().slice(0, 10);
}

const PASSWORD = 'IntegrationCheck!2026';

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const failures: string[] = [];
const inspectionOnly: string[] = [];

function assertOk(label: string, ok: boolean, detail: string): void {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label} — ${detail}`);
    failures.push(`${label}: ${detail}`);
  }
}

function observe(label: string, detail: string): void {
  console.log(`  · ${label}: ${detail}`);
}

function errText(e: unknown): string {
  if (!e) return 'none';
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e) return String((e as any).message);
  return String(e);
}

/** Raw database / gateway vocabulary that must never reach a registrant (2.4). */
function containsRawText(message: string | null): boolean {
  if (!message) return false;
  return /row-level security|violates|constraint|duplicate key|relation "|pgrst|23505|policy|non-2xx|not found|boot_error|failed to fetch|404|503|edge function/i.test(
    message
  );
}

// ---------------------------------------------------------------------------
// The behaviour under test — faithful mirror of invitesApi.redeemInviteCode()
// ---------------------------------------------------------------------------

/** Identical to the constant in `src/lib/invites-api.ts` and `LiteLandingPage`. */
const REGISTRATION_FALLBACK_MESSAGE =
  "Something went wrong and we couldn't complete your registration. Please try again.";

/** Mirrors `extractFunctionError` in `src/lib/invites-api.ts`, including the fallback. */
async function extractFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body: any = await context.json();
      if (body?.error) {
        return typeof body.error === 'string' ? body.error : REGISTRATION_FALLBACK_MESSAGE;
      }
    } catch {
      // Body wasn't JSON — fall through to the generic message.
    }
  }
  return REGISTRATION_FALLBACK_MESSAGE;
}

interface Submission {
  code: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  privacy_consent: boolean;
}

interface CallResult {
  success: boolean;
  /** What `LiteLandingPage` would display (the wrapper's thrown message). */
  message: string | null;
  user: Record<string, any> | null;
  team: Record<string, any> | null;
  emailConfirmed: boolean | null;
  emailConfirmationRequired: boolean | null;
  sessionBefore: 'null' | 'present';
  sessionDuring: Array<'null' | 'present'>;
  sessionAfter: 'null' | 'present';
}

/**
 * The wrapper's body, statement for statement: one `functions.invoke` on the
 * anon client, then the same error-body read. `functionName` is a parameter only
 * so case 6 can point it at a name that does not exist; every other case uses
 * `redeem-invite`.
 */
async function callRedeemInvite(
  x: Submission,
  functionName = 'redeem-invite'
): Promise<CallResult> {
  const out: CallResult = {
    success: false,
    message: null,
    user: null,
    team: null,
    emailConfirmed: null,
    emailConfirmationRequired: null,
    sessionBefore: 'null',
    sessionDuring: [],
    sessionAfter: 'null',
  };

  // Cleanup coverage before the call, not after: the function may create an auth
  // user even on a path that then fails.
  if (isThrowawayEmail(x.email)) createdAuthUserEmails.add(x.email);

  const { data: before } = await anon.auth.getSession();
  out.sessionBefore = before.session ? 'present' : 'null';

  const pending = anon.functions.invoke(functionName, {
    body: {
      code: x.code,
      email: x.email,
      password: x.password,
      first_name: x.first_name,
      last_name: x.last_name,
      privacy_consent: x.privacy_consent === true,
    },
  });

  // "During": poll while the request is genuinely in flight (2.6).
  let settled = false;
  const tracked = pending.finally(() => {
    settled = true;
  });
  while (!settled && out.sessionDuring.length < 25) {
    const { data: during } = await anon.auth.getSession();
    out.sessionDuring.push(during.session ? 'present' : 'null');
    await new Promise((r) => setTimeout(r, 40));
  }

  const { data: result, error } = await tracked;

  const { data: after } = await anon.auth.getSession();
  out.sessionAfter = after.session ? 'present' : 'null';

  if (error) {
    out.message = await extractFunctionError(error);
    return out;
  }
  if (result?.error) {
    out.message =
      typeof result.error === 'string' ? result.error : REGISTRATION_FALLBACK_MESSAGE;
    return out;
  }
  if (!result?.user) {
    out.message = REGISTRATION_FALLBACK_MESSAGE;
    return out;
  }

  out.success = true;
  out.user = result.user;
  out.team = result.team ?? null;
  out.emailConfirmed = result.email_confirmed ?? null;
  out.emailConfirmationRequired = result.email_confirmation_required ?? null;
  return out;
}

// ---------------------------------------------------------------------------
// Inspection helpers (service role — observation only)
// ---------------------------------------------------------------------------

async function adminAuthUsers(email: string): Promise<Record<string, any>[]> {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
    { headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!res.ok) return [];
  const body: any = await res.json();
  const users: any[] = body.users ?? [];
  return users.filter((u) => (u.email ?? '').toLowerCase() === email.toLowerCase());
}

async function findAuthUser(email: string): Promise<Record<string, any> | null> {
  return (await adminAuthUsers(email))[0] ?? null;
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

async function countMemberships(userId: string): Promise<number> {
  const { data } = await admin.from('team_members').select('id').eq('user_id', userId);
  return data?.length ?? -1;
}

async function readInvite(code: string): Promise<Record<string, any> | null> {
  const { data } = await admin.from('invite_codes').select('*').eq('code', code).maybeSingle();
  return data ?? null;
}

function sourceOf(relPath: string): string {
  return readFileSync(resolve(projectRoot, relPath), 'utf8');
}

// ---------------------------------------------------------------------------
// Fixtures + teardown
// ---------------------------------------------------------------------------

const createdInviteIds: string[] = [];
const createdAuthUserEmails = new Set<string>();

interface Fixtures {
  teamId: string;
  teamLabel: string;
  secondTeamId: string | null;
  secondTeamLabel: string | null;
  createdBy: string;
  matchCode: string;
  matchEmail: string;
  nonMatchCode: string;
  nonMatchInvitedEmail: string;
  nonMatchSubmittedEmail: string;
  copyLinkCode: string;
  copyLinkEmail: string;
  crossTeamCode: string | null;
}

async function setup(): Promise<Fixtures> {
  const { data: teams, error: teamErr } = await admin
    .from('teams')
    .select('id, name, age_group')
    .limit(2);
  if (teamErr || !teams?.length) throw new Error(`No team available: ${errText(teamErr)}`);

  const { data: creator, error: creatorErr } = await admin
    .from('users')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();
  if (creatorErr || !creator) throw new Error(`No admin user for created_by: ${errText(creatorErr)}`);

  const label = (t: any) => `${t.age_group ?? ''} ${t.name ?? ''}`.trim();

  const inFuture = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();

  const matchEmail = throwawayEmail('match');
  const nonMatchInvitedEmail = throwawayEmail('invited');
  const nonMatchSubmittedEmail = throwawayEmail('other');
  const copyLinkEmail = throwawayEmail('copylink');

  const matchCode = throwawayCode('A');
  const nonMatchCode = throwawayCode('B');
  const copyLinkCode = throwawayCode('C');
  const crossTeamCode = teams.length > 1 ? throwawayCode('D') : null;

  const rows: Record<string, any>[] = [
    { code: matchCode, team_id: teams[0].id, recipient_email: matchEmail, expires_at: inFuture },
    {
      code: nonMatchCode,
      team_id: teams[0].id,
      recipient_email: nonMatchInvitedEmail,
      expires_at: inFuture,
    },
    {
      code: copyLinkCode,
      team_id: teams[0].id,
      recipient_email: copyLinkEmail,
      expires_at: inFuture,
    },
  ];
  if (crossTeamCode) {
    rows.push({
      code: crossTeamCode,
      team_id: teams[1].id,
      recipient_email: matchEmail,
      expires_at: inFuture,
    });
  }

  const { data: invites, error: inviteErr } = await admin
    .from('invite_codes')
    .insert(rows.map((r) => ({ ...r, created_by: creator.id, redeemed_by: null, redeemed_at: null })))
    .select('id, code');
  if (inviteErr || !invites) throw new Error(`Could not create fixture invites: ${errText(inviteErr)}`);
  for (const i of invites) createdInviteIds.push(i.id);

  return {
    teamId: teams[0].id,
    teamLabel: label(teams[0]),
    secondTeamId: teams[1]?.id ?? null,
    secondTeamLabel: teams[1] ? label(teams[1]) : null,
    createdBy: creator.id,
    matchCode,
    matchEmail,
    nonMatchCode,
    nonMatchInvitedEmail,
    nonMatchSubmittedEmail,
    copyLinkCode,
    copyLinkEmail,
    crossTeamCode,
  };
}

async function cleanup(): Promise<void> {
  console.log('\n── Cleanup ─────────────────────────────────────────────');

  const { data: testUsers } = await admin
    .from('users')
    .select('id, email')
    .like('email', `${TEST_EMAIL_PREFIX}%`);

  for (const u of testUsers ?? []) {
    if (!isThrowawayEmail(u.email)) {
      console.log(`  REFUSED to remove non-throwaway users row: ${u.email}`);
      continue;
    }
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

  for (const email of createdAuthUserEmails) {
    if (!isThrowawayEmail(email)) {
      console.log(`  REFUSED to delete non-throwaway auth user: ${email}`);
      continue;
    }
    for (const authUser of await adminAuthUsers(email)) {
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
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════');
  console.log(' Integration verification — lite user registration (4.1)');
  console.log(' Property 3: pre-confirmation follows the email match');
  console.log(' EXPECTED: every assertion PASSES on the deployed fix');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Project: ${SUPABASE_URL}`);
  console.log(`Role under test: anon, no user session`);
  console.log(`Run id: ${RUN_ID}\n`);

  const fx = await setup();
  console.log(`Fixtures: team "${fx.teamLabel}" (${fx.teamId})`);
  console.log(`  matching-email code    ${fx.matchCode}     -> ${fx.matchEmail}`);
  console.log(`  non-matching code      ${fx.nonMatchCode}     -> invite addressed to ${fx.nonMatchInvitedEmail}`);
  console.log(`                                            submitted as ${fx.nonMatchSubmittedEmail}`);
  console.log(`  copy-link code         ${fx.copyLinkCode}     -> ${fx.copyLinkEmail}`);
  console.log(
    fx.crossTeamCode
      ? `  cross-team code        ${fx.crossTeamCode}     -> ${fx.matchEmail} on "${fx.secondTeamLabel}" (${fx.secondTeamId})`
      : `  cross-team code        (skipped — only one team exists on this project)`
  );

  // =========================================================================
  // Case 1 — happy path, MATCHING email (2.2, 2.5, 2.6, 2.7)
  // =========================================================================
  console.log('\n── Case 1: happy path, email matches the invite ────────');
  const submission1: Submission = {
    code: fx.matchCode,
    email: fx.matchEmail,
    password: PASSWORD,
    first_name: 'Integration',
    last_name: 'Match',
    privacy_consent: true,
  };
  const r1 = await callRedeemInvite(submission1);

  observe(
    'outcome',
    `success=${r1.success} message="${r1.message ?? 'none'}" email_confirmed=${r1.emailConfirmed} ` +
      `email_confirmation_required=${r1.emailConfirmationRequired}`
  );

  assertOk('registration succeeds', r1.success === true, `message="${r1.message}"`);

  const auth1 = await findAuthUser(fx.matchEmail);
  const profile1 = await findUsersRow(fx.matchEmail);
  const member1 = profile1 ? await findTeamMember(fx.teamId, profile1.id) : null;
  const invite1 = await readInvite(fx.matchCode);

  assertOk('write 1/4 — auth user exists', !!auth1, 'no auth.users row');
  assertOk(
    "write 2/4 — public.users row with user_type='lite' and privacy_consent_at",
    !!profile1 && profile1.user_type === 'lite' && !!profile1.privacy_consent_at,
    `row=${!!profile1} user_type=${profile1?.user_type ?? 'n/a'} privacy_consent_at=${profile1?.privacy_consent_at ?? 'null'}`
  );
  assertOk('write 3/4 — team_members row for invite.team_id', !!member1, `team ${fx.teamId}`);
  assertOk(
    'write 4/4 — invite_codes.redeemed_by = user.id',
    !!invite1?.redeemed_by && !!profile1 && invite1.redeemed_by === profile1.id,
    `redeemed_by=${invite1?.redeemed_by ?? 'null'}`
  );

  // Pre-confirmation, and no Supabase confirmation email (2.7)
  assertOk(
    'account is pre-confirmed (email_confirmed_at set)',
    !!auth1?.email_confirmed_at,
    `email_confirmed_at=${auth1?.email_confirmed_at ?? 'null'}`
  );
  assertOk(
    'no Supabase confirmation email sent (confirmation_sent_at null)',
    !auth1?.confirmation_sent_at,
    `confirmation_sent_at=${auth1?.confirmation_sent_at ?? 'null'}`
  );
  assertOk(
    'response reports email_confirmed=true / no confirmation required',
    r1.emailConfirmed === true && r1.emailConfirmationRequired === false,
    `email_confirmed=${r1.emailConfirmed} email_confirmation_required=${r1.emailConfirmationRequired}`
  );

  // The proof that matters: actually log in, immediately, no confirmation step.
  const loginClient1 = freshLoginClient();
  const login1 = await loginClient1.auth.signInWithPassword({
    email: fx.matchEmail,
    password: PASSWORD,
  });
  observe(
    'signInWithPassword (matching email)',
    `session=${login1.data.session ? 'present' : 'null'} error="${errText(login1.error)}"`
  );
  assertOk(
    'can log in immediately with no confirmation step',
    !login1.error && !!login1.data.session,
    `error="${errText(login1.error)}" session=${login1.data.session ? 'present' : 'null'}`
  );
  await loginClient1.auth.signOut();

  // getSession() null before, during and after (2.6)
  console.log('\n── Case 1 (cont): browser session throughout the call ──');
  observe(
    'getSession()',
    `before=${r1.sessionBefore} during=[${r1.sessionDuring.join(',') || 'no in-flight sample'}] after=${r1.sessionAfter}`
  );
  assertOk('getSession() null BEFORE the successful call', r1.sessionBefore === 'null', r1.sessionBefore);
  assertOk(
    'getSession() null DURING the successful call (polled in flight)',
    r1.sessionDuring.length > 0 && r1.sessionDuring.every((s) => s === 'null'),
    `samples=[${r1.sessionDuring.join(',')}]`
  );
  assertOk('getSession() null AFTER the successful call', r1.sessionAfter === 'null', r1.sessionAfter);
  const { data: sessionAfterLogin } = await anon.auth.getSession();
  assertOk(
    'client under test still holds no session after the separate login',
    !sessionAfterLogin.session,
    'a session appeared on the client under test'
  );

  // =========================================================================
  // Case 2 — happy path, NON-MATCHING email (2.8) — the half 3.7 did not cover
  // =========================================================================
  console.log('\n── Case 2: happy path, email does NOT match the invite ─');
  const r2 = await callRedeemInvite({
    code: fx.nonMatchCode,
    email: fx.nonMatchSubmittedEmail,
    password: PASSWORD,
    first_name: 'Integration',
    last_name: 'NonMatch',
    privacy_consent: true,
  });

  observe(
    'outcome',
    `success=${r2.success} message="${r2.message ?? 'none'}" email_confirmed=${r2.emailConfirmed} ` +
      `email_confirmation_required=${r2.emailConfirmationRequired}`
  );

  assertOk('registration still succeeds for a non-invited address', r2.success === true, `message="${r2.message}"`);

  const auth2 = await findAuthUser(fx.nonMatchSubmittedEmail);
  const profile2 = await findUsersRow(fx.nonMatchSubmittedEmail);
  const member2 = profile2 ? await findTeamMember(fx.teamId, profile2.id) : null;
  const invite2 = await readInvite(fx.nonMatchCode);

  assertOk('auth user exists', !!auth2, 'no auth.users row');
  assertOk(
    "public.users row with user_type='lite' and privacy_consent_at",
    !!profile2 && profile2.user_type === 'lite' && !!profile2.privacy_consent_at,
    `row=${!!profile2} user_type=${profile2?.user_type ?? 'n/a'} privacy_consent_at=${profile2?.privacy_consent_at ?? 'null'}`
  );
  assertOk('membership completed for the invite team', !!member2, `team ${fx.teamId}`);
  assertOk(
    'invite redeemed by that user',
    !!invite2?.redeemed_by && !!profile2 && invite2.redeemed_by === profile2.id,
    `redeemed_by=${invite2?.redeemed_by ?? 'null'}`
  );

  observe(
    'auth flags for the non-invited address',
    `email_confirmed_at=${auth2?.email_confirmed_at ?? 'null'} ` +
      `confirmation_sent_at=${auth2?.confirmation_sent_at ?? 'null'} ` +
      `(admin createUser with email_confirm:false leaves the account unconfirmed; ` +
      `GoTrue does not itself dispatch a confirmation mail for an admin-created user)`
  );
  assertOk(
    'account is NOT pre-confirmed (email_confirmed_at null)',
    !auth2?.email_confirmed_at,
    `email_confirmed_at=${auth2?.email_confirmed_at ?? 'null'}`
  );
  assertOk(
    'response reports confirmation required',
    r2.emailConfirmed === false && r2.emailConfirmationRequired === true,
    `email_confirmed=${r2.emailConfirmed} email_confirmation_required=${r2.emailConfirmationRequired}`
  );

  const loginClient2 = freshLoginClient();
  const login2 = await loginClient2.auth.signInWithPassword({
    email: fx.nonMatchSubmittedEmail,
    password: PASSWORD,
  });
  observe(
    'signInWithPassword (non-matching email)',
    `session=${login2.data.session ? 'present' : 'null'} error="${errText(login2.error)}" ` +
      `code=${(login2.error as any)?.code ?? 'n/a'}`
  );
  assertOk(
    'login is REFUSED until Supabase confirmation (2.8)',
    !!login2.error && !login2.data.session,
    `error="${errText(login2.error)}" session=${login2.data.session ? 'present' : 'null'}`
  );
  assertOk(
    'refusal is specifically the confirmation gate, not a wrong-password error',
    /confirm/i.test(errText(login2.error)) ||
      (login2.error as any)?.code === 'email_not_confirmed',
    `error="${errText(login2.error)}" code=${(login2.error as any)?.code ?? 'n/a'}`
  );

  // =========================================================================
  // Case 3a — Copy Link delivery is indistinguishable from an emailed link (3.4)
  // =========================================================================
  console.log('\n── Case 3a: Copy Link delivery, live ───────────────────');
  // Exactly what `copyInviteLink()` puts on the clipboard, and exactly what the
  // `/invite/:code` route hands to `LiteLandingPage` when that link is opened.
  const copiedLink = `https://clubfootball.app/invite/${fx.copyLinkCode}`;
  const routeParamCode = decodeURIComponent(new URL(copiedLink).pathname.split('/').pop() ?? '');
  observe('clipboard link', copiedLink);
  observe('code recovered from the link', routeParamCode);
  assertOk(
    'the code carried by a copied link is the code that was generated',
    routeParamCode === fx.copyLinkCode,
    `recovered="${routeParamCode}" expected="${fx.copyLinkCode}"`
  );

  const r3 = await callRedeemInvite({
    code: routeParamCode,
    email: fx.copyLinkEmail,
    password: PASSWORD,
    first_name: 'Integration',
    last_name: 'CopyLink',
    privacy_consent: true,
  });
  const auth3 = await findAuthUser(fx.copyLinkEmail);
  const profile3 = await findUsersRow(fx.copyLinkEmail);
  const member3 = profile3 ? await findTeamMember(fx.teamId, profile3.id) : null;
  const invite3 = await readInvite(fx.copyLinkCode);

  observe('outcome', `success=${r3.success} message="${r3.message ?? 'none'}"`);
  assertOk(
    'a copied link registers exactly as an emailed one would (all four writes, pre-confirmed)',
    r3.success === true &&
      !!auth3?.email_confirmed_at &&
      !!profile3 &&
      profile3.user_type === 'lite' &&
      !!member3 &&
      invite3?.redeemed_by === profile3.id,
    `success=${r3.success} confirmed=${auth3?.email_confirmed_at ?? 'null'} profile=${!!profile3} ` +
      `member=${!!member3} redeemed_by=${invite3?.redeemed_by ?? 'null'}`
  );

  // =========================================================================
  // Case 3b — Send Link / Resend Link, BY INSPECTION (quota, not run live)
  // =========================================================================
  console.log('\n── Case 3b: Send Link / Resend Link, by inspection ─────');
  console.log(
    '  NOT RUN LIVE: sending would consume the project SMTP/auth email quota\n' +
      '  (the same quota that blocked task 1 with "email rate limit exceeded").\n' +
      '  Verified by reading the invite creation/send path instead.'
  );
  inspectionOnly.push('Send Link / Resend Link verified by code inspection, not run live');

  const competitionsPage = sourceOf('src/pages/desktop/CompetitionsPage.tsx');
  const emailApiSrc = sourceOf('src/lib/email-api.ts');
  const sendEmailFn = sourceOf('supabase/functions/send-email/index.ts');
  const invitesApiSrc = sourceOf('src/lib/invites-api.ts');

  assertOk(
    'Send Link and Resend Link are the same action, relabelled after a send',
    /sentCodes\.includes\(code\)\s*\?\s*'Resend Link'\s*:\s*'Send Link'/.test(competitionsPage) &&
      /sendInviteLink\(/.test(competitionsPage),
    'sendLabel / sendInviteLink not found as expected in CompetitionsPage.tsx'
  );
  assertOk(
    'Send Link goes through emailApi.sendTeamInvite with the invite code',
    /emailApi\.sendTeamInvite\(\{[\s\S]*inviteCode: opts\.code/.test(competitionsPage) &&
      /sendTeamInvite/.test(emailApiSrc),
    'sendInviteTeam wiring not found'
  );
  assertOk(
    'the emailed link is built from the same code as the copied one',
    /\$\{branding\.appUrl\}\/invite\/\$\{encodeURIComponent\(data\.inviteCode\)\}/.test(sendEmailFn) &&
      /\$\{window\.location\.origin\}\/invite\/\$\{code\}/.test(competitionsPage),
    'link construction differs between send-email and copyInviteLink'
  );
  assertOk(
    'redemption depends on the code only — delivery method is not part of the request',
    /functions\.invoke\('redeem-invite',\s*\{[\s\S]*?body:\s*\{[\s\S]*?code,[\s\S]*?privacy_consent[\s\S]*?\}/.test(
      invitesApiSrc
    ) && !/delivery|deliveredBy|sentBy/i.test(invitesApiSrc),
    'the wrapper payload carries something delivery-specific, or was not found'
  );
  assertOk(
    'invite generation is untouched by the fix (still a plain invite_codes insert)',
    /generateInviteCode\(/.test(invitesApiSrc) &&
      /from\('invite_codes'\)\s*\n?\s*\.insert\(\{/.test(invitesApiSrc),
    'generateInviteCode no longer inserts invite_codes directly'
  );

  // =========================================================================
  // Case 4 — existing user across two teams (3.1)
  // =========================================================================
  console.log('\n── Case 4: existing user across two teams (3.1) ────────');
  console.log(
    '  Already proven live in task 3.8 (re-enabled preservation test: one auth user,\n' +
      '  one public.users row, memberships 1 -> 2, second code redeemed by the same id).\n' +
      '  Re-checked here cheaply because the fixtures for it already exist.'
  );
  if (fx.crossTeamCode && fx.secondTeamId && profile1) {
    const r4 = await callRedeemInvite({
      code: fx.crossTeamCode,
      email: fx.matchEmail,
      password: PASSWORD,
      first_name: 'Integration',
      last_name: 'Match',
      privacy_consent: true,
    });
    const authUsers4 = await adminAuthUsers(fx.matchEmail);
    const { data: usersRows4 } = await admin.from('users').select('id').eq('email', fx.matchEmail);
    const memberships4 = await countMemberships(profile1.id);
    const member4 = await findTeamMember(fx.secondTeamId, profile1.id);
    const invite4 = await readInvite(fx.crossTeamCode);

    observe(
      'outcome',
      `success=${r4.success} returnedUserId=${r4.user?.id ?? 'none'} authUsers=${authUsers4.length} ` +
        `usersRows=${usersRows4?.length ?? 0} memberships=${memberships4}`
    );
    assertOk(
      'second team joins the SAME account — one auth user, one profile row, two memberships',
      r4.success === true &&
        r4.user?.id === profile1.id &&
        authUsers4.length === 1 &&
        (usersRows4?.length ?? 0) === 1 &&
        memberships4 === 2 &&
        !!member4 &&
        invite4?.redeemed_by === profile1.id,
      `success=${r4.success} returnedId=${r4.user?.id ?? 'none'} expectedId=${profile1.id} ` +
        `authUsers=${authUsers4.length} usersRows=${usersRows4?.length ?? 0} memberships=${memberships4} ` +
        `secondTeamMember=${!!member4} redeemed_by=${invite4?.redeemed_by ?? 'null'}`
    );
  } else {
    console.log('  SKIPPED live re-check: this project has only one team row — citing task 3.8.');
    inspectionOnly.push('Cross-team existing user: cited from task 3.8 (single team on project)');
  }

  // =========================================================================
  // Case 5 — the call resolves against the ABSOLUTE functions URL (D1)
  // =========================================================================
  console.log('\n── Case 5: resolved Functions URL, as requested ────────');
  const projectHost = new URL(SUPABASE_URL!).host; // <project-ref>.supabase.co
  const expectedUrl = `${SUPABASE_URL!.replace(/\/$/, '')}/functions/v1/redeem-invite`;
  const functionRequests = requestLog.filter((r) => r.url.includes('/functions/v1/redeem-invite'));
  const observedUrl = functionRequests[0]?.url ?? null;

  observe('requests recorded from the client under test', String(requestLog.length));
  observe('redeem-invite request URL as supabase-js issued it', observedUrl ?? 'none captured');
  observe(
    'client config functionsUrl',
    String((anon as any).functionsUrl ?? (anon.functions as any)?.url ?? 'not exposed')
  );

  assertOk(
    'supabase-js requested the absolute https://<project-ref>.supabase.co/functions/v1/redeem-invite',
    observedUrl === expectedUrl,
    `observed="${observedUrl}" expected="${expectedUrl}"`
  );
  if (observedUrl) {
    const parsed = new URL(observedUrl);
    assertOk(
      'the URL is absolute and points at the Supabase project host, not an app origin',
      parsed.protocol === 'https:' &&
        parsed.host === projectHost &&
        /\.supabase\.co$/.test(parsed.host) &&
        parsed.pathname === '/functions/v1/redeem-invite',
      `protocol=${parsed.protocol} host=${parsed.host} path=${parsed.pathname}`
    );
    assertOk(
      'no relative / app-origin request was made for the function (what would break the Android wrapper)',
      !requestLog.some(
        (r) => r.url.includes('redeem-invite') && new URL(r.url, 'https://placeholder.invalid').host !== projectHost
      ),
      requestLog.filter((r) => r.url.includes('redeem-invite')).map((r) => r.url).join(', ')
    );
  }
  assertOk(
    'the URL derives from the client config (VITE_SUPABASE_URL), not from window.location',
    !/window\.location|document\.baseURI/.test(sourceOf('src/lib/supabase.ts')) &&
      /createClient\(supabaseUrl, supabaseAnonKey\)/.test(sourceOf('src/lib/supabase.ts')),
    'src/lib/supabase.ts no longer builds the client from VITE_SUPABASE_URL alone'
  );

  // =========================================================================
  // Case 6 — undeployed function fails loudly and cleanly
  // =========================================================================
  console.log('\n── Case 6: function not deployed (simulated) ──────────');
  console.log(
    '  `redeem-invite` is NOT undeployed. A deliberately nonexistent function name\n' +
      '  is invoked instead, which is the same condition the client hits when the\n' +
      '  deploy step is forgotten: the function does not exist at that URL.'
  );
  const absentName = `redeem-invite-absent-${RUN_ID}`;
  const r6 = await callRedeemInvite(
    {
      code: fx.matchCode,
      email: throwawayEmail('absent'),
      password: PASSWORD,
      first_name: 'Integration',
      last_name: 'Absent',
      privacy_consent: true,
    },
    absentName
  );
  observe('invoked', absentName);
  observe('outcome', `success=${r6.success} message="${r6.message ?? 'none'}"`);
  assertOk('the call fails rather than silently succeeding', r6.success === false, `success=${r6.success}`);
  assertOk(
    'a clear plain-language message is produced',
    r6.message === REGISTRATION_FALLBACK_MESSAGE,
    `message="${r6.message}"`
  );
  assertOk(
    'no raw database or gateway text in the message',
    !containsRawText(r6.message),
    `message="${r6.message}"`
  );

  const landingPage = sourceOf('src/pages/LiteLandingPage.tsx');
  assertOk(
    'the landing page renders that message through its safe path with a fallback',
    /setFormError\(safeRegistrationErrorMessage\(err\)\)/.test(landingPage) &&
      /if \(!\(err instanceof ApiError\)\) return REGISTRATION_FALLBACK_MESSAGE;/.test(landingPage),
    'LiteLandingPage no longer funnels registration errors through safeRegistrationErrorMessage'
  );
  assertOk(
    'nothing was written by the failed call (the fixture code is still redeemable state it was in)',
    (await findUsersRow(throwawayEmail('absent'))) === null &&
      (await adminAuthUsers(throwawayEmail('absent'))).length === 0,
    'the undeployed-function attempt left records behind'
  );

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n═══════════════════════════════════════════════════════');
  if (inspectionOnly.length) {
    console.log(' Verified by inspection rather than live execution:');
    for (const i of inspectionOnly) console.log(`  · ${i}`);
    console.log('');
  }
  if (failures.length === 0) {
    console.log(' PROPERTY 3 HELD — pre-confirmation follows the email match,');
    console.log(' end to end, with no browser session at any point.');
    console.log('═══════════════════════════════════════════════════════');
    return;
  }
  console.log(` ${failures.length} FAILED assertion(s)`);
  console.log('═══════════════════════════════════════════════════════');
  for (const f of failures) console.log(`  ✗ ${f}`);
  console.log('\nFailing example (counterexample):');
  console.log(
    JSON.stringify(
      {
        matchingEmail: {
          code: fx.matchCode,
          email: fx.matchEmail,
          success: r1.success,
          message: r1.message,
          session: { before: r1.sessionBefore, during: r1.sessionDuring, after: r1.sessionAfter },
        },
        nonMatchingEmail: {
          code: fx.nonMatchCode,
          invited: fx.nonMatchInvitedEmail,
          submitted: fx.nonMatchSubmittedEmail,
          success: r2.success,
          message: r2.message,
          emailConfirmationRequired: r2.emailConfirmationRequired,
        },
        copyLink: { code: fx.copyLinkCode, success: r3.success, message: r3.message },
        undeployed: { name: absentName, success: r6.success, message: r6.message },
        functionsUrl: observedUrl,
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
        ? '\nRESULT: FAILED (see failed assertions above).'
        : process.exitCode === 2
          ? '\nRESULT: BLOCKED (script/environment error).'
          : '\nRESULT: PASSED.'
    );
  });
