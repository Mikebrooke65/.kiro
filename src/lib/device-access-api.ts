import { ApiClient, ApiError } from './api-client';

/**
 * Same generic message the Edge Function itself returns for every failure
 * mode (expired, already redeemed, unknown code) — design.md is explicit
 * this never distinguishes which, so every fallback here matches that
 * wording rather than inventing a different one for the transport-failure
 * case.
 */
const FALLBACK_MESSAGE = 'This code is no longer valid. Ask your caregiver for a new one.';

/**
 * Requirement 7.4.4 — redeeming a caregiver-issued device code, from the
 * child's own device, with no session yet. A thin wrapper over the
 * `redeem-device-code` Edge Function, kept in its own file rather than
 * folded into `caregivers-api.ts` (that file's calls all assume an
 * authenticated caregiver; this one is anon-callable, called by the child's
 * browser, and unrelated to any caregiver action) or `invites-api.ts` (a
 * device code is not an invite — no team, no role, no `invite_codes` row).
 *
 * `DeviceAccessLandingPage.tsx` is the only intended caller: it calls this,
 * then — on success — calls `supabase.auth.verifyOtp({ token_hash, type:
 * 'magiclink' })` itself with the plain anon client, since that call is what
 * actually establishes the session in the browser; this wrapper never touches
 * `supabase.auth` directly, only the Edge Function invocation.
 */
class DeviceAccessApi extends ApiClient {
  async redeemDeviceCode(code: string): Promise<{ tokenHash: string }> {
    const { data: result, error } = await this.supabase.functions.invoke('redeem-device-code', {
      body: { code },
    });

    if (error) {
      throw new ApiError(await extractFunctionError(error));
    }
    if (result?.error) {
      throw new ApiError(typeof result.error === 'string' ? result.error : FALLBACK_MESSAGE);
    }
    if (!result?.token_hash) {
      throw new ApiError(FALLBACK_MESSAGE);
    }

    return { tokenHash: result.token_hash as string };
  }
}

/**
 * `functions.invoke` surfaces non-2xx responses as an opaque error — the
 * useful message is in the response body, read off `error.context`. Same
 * approach as every other `*-api.ts` file in this project; kept local so the
 * fallback matches this file's own wording.
 */
async function extractFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json();
      if (body?.error) {
        return typeof body.error === 'string' ? body.error : FALLBACK_MESSAGE;
      }
    } catch {
      // Body wasn't JSON — fall through to the generic message.
    }
  }
  return FALLBACK_MESSAGE;
}

export const deviceAccessApi = new DeviceAccessApi();
