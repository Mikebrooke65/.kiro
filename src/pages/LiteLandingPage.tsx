import { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { invitesApi } from '../lib/invites-api';
import { ApiError } from '../lib/api-client';
import { useClubBranding, type ClubBranding } from '../hooks/useClubBranding';
import {
  selectWelcomeVariant,
  buildGreeting,
  formatTeamLabel,
  needsAdultSelfDeclaration,
  isValidDateOfBirth,
  resolvePrimaryActionHref,
  type RedeemInviteResult,
} from '../lib/success-screen-logic';
import type { InviteCodeValidation } from '../types/database';

/**
 * Spec: `.kiro/specs/lite-user-registration-fix/` (task 3.4)
 *
 * Shown whenever registration fails without a message we know is safe to
 * display. Plain language, no database text (2.4).
 */
const REGISTRATION_FALLBACK_MESSAGE =
  "Something went wrong and we couldn't complete your registration. Please try again.";

/**
 * Text that must never reach the person registering (2.4). This is the wording
 * the observed RLS failure was built from — *"new row violates row-level
 * security policy for table users"* — plus the neighbouring database vocabulary.
 */
const FORBIDDEN_MESSAGE_FRAGMENTS = [
  'row-level security',
  'row level security',
  'violates',
  'constraint',
  'policy',
  'permission denied',
  'sql',
];

/**
 * Decide what to show when `redeemInviteCode()` rejects.
 *
 * Only an `ApiError` from the wrapper is trusted: it carries the `redeem-invite`
 * function's own plain-language message, drawn from the safe set in
 * `supabase/functions/redeem-invite/logic.ts` (expired code, already-used code,
 * email already registered, and so on). Anything else — a transport failure, a
 * thrown string, a supabase-js internal — is replaced wholesale rather than
 * rendered, because that is the path that used to leak *"new row violates
 * row-level security policy for table users"* straight into the form.
 *
 * The fragment screen is deliberate belt-and-braces at the render boundary: even
 * if a raw database message ever found its way into an `ApiError`, it still would
 * not be shown.
 */
function safeRegistrationErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return REGISTRATION_FALLBACK_MESSAGE;

  const message = typeof err.message === 'string' ? err.message.trim() : '';
  if (message === '') return REGISTRATION_FALLBACK_MESSAGE;

  const lower = message.toLowerCase();
  if (FORBIDDEN_MESSAGE_FRAGMENTS.some(fragment => lower.includes(fragment))) {
    return REGISTRATION_FALLBACK_MESSAGE;
  }

  return message;
}

/** Today as `yyyy-mm-dd`, for the DOB input's `max` (can't be in the future). */
function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function LiteLandingPage() {
  const { code } = useParams<{ code: string }>();
  const [validation, setValidation] = useState<InviteCodeValidation | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // The full redemption result drives the branded, path-aware Success Screen
  // (Req 1.1/1.6/1.8) — a plain boolean would lose the flags and team/user data.
  const [result, setResult] = useState<RedeemInviteResult | null>(null);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    date_of_birth: '',
    consent: false,
  });

  // All Success Screen branding (name, colour, logo, app link) comes from here —
  // never a hardcoded literal (Req 1.7). Absent values are omitted downstream.
  const { branding } = useClubBranding();

  useEffect(() => {
    if (code) {
      invitesApi.validateInviteCode(code).then(v => {
        setValidation(v);
        setLoading(false);
      });
    }
  }, [code]);

  // Requirement 3.4 — every intended role except Caregiver self-declares
  // their own date of birth here; a Caregiver invite is never asked for one
  // (Requirement 4.6). `validation.invite` is only set once `valid` is true.
  const requiresDateOfBirth =
    validation?.valid === true && needsAdultSelfDeclaration(validation.invite?.intended_role);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!form.consent) {
      setFormError('You must accept the privacy notice to continue.');
      return;
    }
    if (!form.first_name || !form.last_name || !form.email || !form.password) {
      setFormError('All fields are required.');
      return;
    }
    if (form.password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }
    if (requiresDateOfBirth && !isValidDateOfBirth(form.date_of_birth)) {
      setFormError('Please enter a valid date of birth.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await invitesApi.redeemInviteCode(code!, {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        password: form.password,
        privacy_consent: form.consent,
        // Omitted entirely on a Caregiver invite — redeem-invite never asks
        // for one on that path (Requirement 4.6).
        date_of_birth: requiresDateOfBirth ? form.date_of_birth : undefined,
      });
      setResult(res);
    } catch (err) {
      // Never `err.message` unconditionally — that is what put raw policy text
      // in front of registrants (2.4).
      setFormError(safeRegistrationErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Validating invite code...</p>
      </div>
    );
  }

  // Error states
  if (!validation?.valid) {
    const errorMessages: Record<string, { title: string; message: string }> = {
      expired: {
        title: 'Code Expired',
        message: 'This code has expired. Your coach/manager has been notified and can send you a new one.',
      },
      redeemed: {
        title: 'Already Used',
        message: 'This invite code has already been used.',
      },
      invalid: {
        title: 'Invalid Code',
        message: 'This invite code is not valid. Please check the link and try again.',
      },
    };
    const err = errorMessages[validation?.error || 'invalid'];

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold mb-2">{err.title}</h1>
          <p className="text-gray-600">{err.message}</p>
        </div>
      </div>
    );
  }

  // Success state — branded, path-aware Success Screen (Req 1.1-1.11).
  if (result) {
    return <SuccessScreen result={result} branding={branding} />;
  }

  // Registration form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold">Join {validation.team?.age_group} {validation.team?.name}</h1>
          <p className="text-sm text-gray-500 mt-1">Create your account to get started</p>
        </div>

        {formError && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{formError}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <input type="text" placeholder="First name" value={form.first_name}
              onChange={e => setForm({ ...form, first_name: e.target.value })}
              className="border rounded-lg px-3 py-2 text-sm" required />
            <input type="text" placeholder="Last name" value={form.last_name}
              onChange={e => setForm({ ...form, last_name: e.target.value })}
              className="border rounded-lg px-3 py-2 text-sm" required />
          </div>
          <input type="email" placeholder="Email address" value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm" required />
          <input type="password" placeholder="Create a password (min 6 characters)" value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm" required minLength={6} />

          {/* Adult self-declaration (Req 3.4) — every intended role except
              Caregiver confirms their own date of birth here; this is the
              record of truth, not the Manager's Add Player routing entry. */}
          {requiresDateOfBirth && (
            <div>
              <label htmlFor="lite-registration-dob" className="block text-xs text-gray-500 mb-1">
                Date of birth — confirms you're 16 or over
              </label>
              <input
                id="lite-registration-dob"
                type="date"
                value={form.date_of_birth}
                max={todayIso()}
                onChange={e => setForm({ ...form, date_of_birth: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>
          )}

          {/* Privacy consent */}
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-2">
            <p className="font-semibold text-gray-700">Privacy Notice</p>
            <p>By creating an account, you agree that:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Your name and role will be visible to coaches, managers, and admins of your team(s).</li>
              <li>If you are a caregiver, other caregivers linked to the same player will see your name and contact details.</li>
              <li>Your data is used solely for team coordination within this app.</li>
            </ul>
            <label className="flex items-start gap-2 mt-2 cursor-pointer">
              <input type="checkbox" checked={form.consent}
                onChange={e => setForm({ ...form, consent: e.target.checked })}
                className="mt-0.5" />
              <span>I acknowledge and accept this privacy notice</span>
            </label>
          </div>

          <button type="submit" disabled={submitting || !form.consent}
            className="w-full py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {submitting ? 'Creating account...' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * Post-registration Success Screen (Requirement 1).
 *
 * Renders one of three variants chosen by `selectWelcomeVariant`:
 *   - `matching`               — account is live: personalised welcome (Req 1.1-1.5)
 *   - `confirmation_required`  — check-your-email gate (Req 1.6)
 *   - `generic`                — registration complete, please log in (Req 1.8)
 *
 * CLUB-AGNOSTIC (Req 1.7): every branded element — club name, logo, primary
 * colour, app link — is read from `branding` (i.e. `useClubBranding()` /
 * `club_settings`). Nothing here hardcodes a club name, colour, logo, or URL.
 * Where a branding value is absent the dependent element is omitted rather than
 * substituting a default (Req 1.11 for the app link; logo/name likewise).
 */
function SuccessScreen({
  result,
  branding,
}: {
  result: RedeemInviteResult;
  branding: ClubBranding;
}) {
  const variant = selectWelcomeVariant(result);

  // Accent colour comes from branding only; when absent we fall back to a
  // neutral slate rather than any club's colour (Req 1.7).
  const accent = branding.primary_color?.trim() || null;
  const buttonStyle = accent ? { backgroundColor: accent } : undefined;
  const buttonClass = accent
    ? 'inline-block px-6 py-2 text-white rounded-lg font-medium'
    : 'inline-block px-6 py-2 bg-gray-800 text-white rounded-lg font-medium hover:bg-gray-900';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
        {/* Logo only if branding provides one (Req 1.7) — never a hardcoded asset. */}
        {branding.logo_url && (
          <img
            src={branding.logo_url}
            alt={branding.club_name ?? ''}
            className="h-16 mx-auto mb-4 object-contain"
          />
        )}

        {variant === 'matching' && (
          <MatchingWelcome
            result={result}
            branding={branding}
            buttonClass={buttonClass}
            buttonStyle={buttonStyle}
          />
        )}

        {variant === 'confirmation_required' && (
          <ConfirmationRequired
            emailSent={result.confirmation_email_sent !== false}
          />
        )}

        {variant === 'generic' && (
          <GenericComplete
            hasPendingApproval={result.has_pending_approval}
            buttonClass={buttonClass}
            buttonStyle={buttonStyle}
          />
        )}
      </div>
    </div>
  );
}

/** Matching-address welcome: live account, personalised (Req 1.1-1.5, 1.9-1.11). */
function MatchingWelcome({
  result,
  branding,
  buttonClass,
  buttonStyle,
}: {
  result: RedeemInviteResult;
  branding: ClubBranding;
  buttonClass: string;
  buttonStyle: React.CSSProperties | undefined;
}) {
  // Greeting includes the first name, or a generic greeting when absent (Req 1.9).
  const greeting = buildGreeting(result.user?.first_name);
  // Team name as `{age_group} {name}` (Req 1.2).
  const teamLabel = formatTeamLabel(
    result.team ? { age_group: result.team.age_group, name: result.team.name } : null
  );
  // Competition name shown only when present, otherwise omitted (Req 1.3 / 1.10).
  const competitionName = result.competition_name?.trim() || null;
  // App link only when branding supplies one, otherwise omitted (Req 1.4 / 1.11).
  const appUrl = branding.app_url?.trim() || null;
  // A pending Caregiver approval overrides the normal destination (Req 8.2) —
  // see resolvePrimaryActionHref's own doc comment for why it wins even over
  // a branded appUrl.
  const primaryHref = resolvePrimaryActionHref(result.has_pending_approval, appUrl);
  const primaryLabel =
    primaryHref === '/caregiver-approvals' ? 'Review the Request' : appUrl ? 'Open the app' : 'Go to Login';

  return (
    <>
      <div className="text-4xl mb-4">🎉</div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{greeting}</h1>

      {teamLabel && (
        <p className="text-sm text-gray-600">
          You've been added to <span className="font-semibold text-gray-900">{teamLabel}</span>.
        </p>
      )}

      {competitionName && (
        <p className="text-sm text-gray-600 mt-1">
          Competition: <span className="font-semibold text-gray-900">{competitionName}</span>
        </p>
      )}

      {/* Guidance text — states all three points required by Req 1.5. */}
      <div className="mt-5 text-left bg-gray-50 rounded-lg p-4 text-sm text-gray-600 space-y-2">
        <p className="font-semibold text-gray-700">What you can do next</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>On the Team page you'll see the teams you can manage.</li>
          <li>You can add players to your team.</li>
          <li>
            You can promote one additional player to Manager, up to a maximum of
            two Managers per team.
          </li>
        </ul>
      </div>

      {/* Destination is the pending Caregiver approval when signalled,
          otherwise the app link or a login fallback (Req 1.4 / 1.11 / 8.2). */}
      <a href={primaryHref} className={`${buttonClass} mt-6`} style={buttonStyle}>
        {primaryLabel}
      </a>
    </>
  );
}

/** Non-matching path: instruct the registrant to confirm via email (Req 1.6). */
function ConfirmationRequired({ emailSent }: { emailSent: boolean }) {
  return (
    <>
      <div className="text-4xl mb-4">📧</div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Almost there</h1>
      <p className="text-sm text-gray-600">
        Please check your email and follow the link to confirm your account and
        complete your registration.
      </p>
      {!emailSent && (
        // Req 2.9 surfaced to the user: link generation/send couldn't complete,
        // so the email may take longer than usual to arrive.
        <p className="text-sm text-gray-500 mt-3">
          Your confirmation email may be delayed. If it doesn't arrive shortly,
          please try again later.
        </p>
      )}
    </>
  );
}

/** Generic fallback: registration completed, please log in (Req 1.8). */
function GenericComplete({
  hasPendingApproval,
  buttonClass,
  buttonStyle,
}: {
  hasPendingApproval: boolean | undefined;
  buttonClass: string;
  buttonStyle: React.CSSProperties | undefined;
}) {
  // No branding-supplied appUrl reaches this fallback variant either way —
  // it always falls back to /login unless a Caregiver approval is pending
  // (Req 8.2), same rule as MatchingWelcome.
  const primaryHref = resolvePrimaryActionHref(hasPendingApproval, null);
  const primaryLabel = primaryHref === '/caregiver-approvals' ? 'Review the Request' : 'Go to Login';

  return (
    <>
      <div className="text-4xl mb-4">✅</div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Registration complete</h1>
      <p className="text-sm text-gray-600 mb-6">
        Your registration is complete. You can now log in to the app.
      </p>
      <a href={primaryHref} className={buttonClass} style={buttonStyle}>
        {primaryLabel}
      </a>
    </>
  );
}
