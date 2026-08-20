import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';

/**
 * Completes the "forgot password" flow started on the Login screen.
 *
 * `resetPasswordForEmail` (AuthContext) emails a link to this page. By the
 * time this component's own render decides anything, the Supabase client
 * has already turned that link's URL into a short-lived recovery session
 * (`detectSessionInUrl`, on by default — no manual token parsing needed
 * here), and `AuthContext`'s own session check has picked it up the same
 * way it picks up any other session. So the state this page cares about is
 * just `useAuth()`'s existing `isLoading` / `isAuthenticated` — no
 * PASSWORD_RECOVERY-specific handling required.
 *
 * This is deliberately a top-level public route (see routes/index.tsx),
 * not wrapped in ProtectedRoute — it has to render before we know whether
 * the link produced a valid session, and its own three states below cover
 * every outcome (still checking / no valid session / ready to set a new
 * password) without needing a redirect.
 */
export function ResetPassword() {
  const { isAuthenticated, isLoading, updatePassword } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await updatePassword(password);
      setSuccess(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not update your password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Checking your reset link...</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">✓</div>
          <h1 className="text-xl font-bold mb-2">Password updated</h1>
          <p className="text-gray-600 mb-6">Your password has been changed. You're signed in and ready to go.</p>
          <button
            onClick={() => navigate('/', { replace: true })}
            className="w-full py-2 px-4 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            Continue to app
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold mb-2">Reset link invalid or expired</h1>
          <p className="text-gray-600 mb-6">
            This password reset link no longer works — it may have already been used or expired.
            Request a new one from the login screen.
          </p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="w-full py-2 px-4 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold">Set a new password</h1>
          <p className="text-sm text-gray-500 mt-1">Choose a password for your account</p>
        </div>

        {formError && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{formError}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            placeholder="New password (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            autoComplete="new-password"
            required
            minLength={6}
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            autoComplete="new-password"
            required
            minLength={6}
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 px-4 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Updating...' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}
