import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { supabase } from '../lib/supabase';
import { deviceAccessApi } from '../lib/device-access-api';
import { ApiError } from '../lib/api-client';

/**
 * Spec: `.kiro/specs/streamlined-invites-and-child-access/` (Task 6, Requirement 7.4.4)
 *
 * The device-code landing page — where a child opens their caregiver's
 * shared link **once**, on their own device. No form, no fields: this page
 * either works or it doesn't. On success the device is permanently signed
 * in from then on (7.4.5); there is nothing more for the child to do here
 * ever again on this device.
 *
 * Two calls happen in sequence:
 *   1. `deviceAccessApi.redeemDeviceCode(code)` — the Edge Function call that
 *      validates the code and mints a `token_hash` (never a password).
 *   2. `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })` — run
 *      directly against the plain anon client, right here in the browser.
 *      This is the call that actually establishes the session; step 1 only
 *      prepared the token for it.
 *
 * After a successful `verifyOtp`, this does a **hard, full-page navigation**
 * to `/` rather than an in-app `navigate()`. `AuthContext`'s session state is
 * only ever populated two ways: its own `login()` method (which this page
 * doesn't use — there's no password here) or its initial-mount
 * `supabase.auth.getSession()` read (`onAuthStateChange` deliberately ignores
 * a live `SIGNED_IN` event — see that file's own comment). A full reload is
 * what makes this device-code session behave exactly like any other already-
 * persisted session the app finds on a fresh load, with no changes needed to
 * `AuthContext` itself.
 */
export function DeviceAccessLandingPage() {
  const { code } = useParams<{ code: string }>();
  const [status, setStatus] = useState<'working' | 'success' | 'error'>('working');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!code) {
      setStatus('error');
      setErrorMessage('This link is not valid. Ask your caregiver for a new one.');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { tokenHash } = await deviceAccessApi.redeemDeviceCode(code);
        if (cancelled) return;

        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'magiclink',
        });
        if (error) throw error;
        if (cancelled) return;

        setStatus('success');
        // Hard reload, not react-router navigate — see file header.
        window.location.href = '/';
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setErrorMessage(
          err instanceof ApiError
            ? err.message
            : 'This link is not valid. Ask your caregiver for a new one.'
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
        {status === 'working' && <p className="text-gray-500">Signing you in...</p>}
        {status === 'success' && <p className="text-gray-500">You're all set! Taking you in...</p>}
        {status === 'error' && (
          <>
            <div className="text-4xl mb-4">⚠️</div>
            <h1 className="text-xl font-bold mb-2">Link Not Valid</h1>
            <p className="text-gray-600">{errorMessage}</p>
          </>
        )}
      </div>
    </div>
  );
}
