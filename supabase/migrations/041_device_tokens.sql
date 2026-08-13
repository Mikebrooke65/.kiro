-- Migration 041: Device Tokens for Push Notifications
-- Stores FCM (Firebase Cloud Messaging) device tokens per user, registered
-- from the Capacitor mobile app. Used by Edge Functions to send push
-- notifications for schedule changes, new messages, announcements, etc.
--
-- Changes:
-- 1. CREATE device_tokens table (user_id, token, platform, unique per token)
-- 2. Index on user_id for fast lookup when sending notifications to a user
-- 3. ENABLE RLS: users can manage their own tokens; no cross-user access
--
-- Idempotent: uses IF NOT EXISTS throughout.

CREATE TABLE IF NOT EXISTS public.device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON public.device_tokens(user_id);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only see and manage their own device tokens
CREATE POLICY "Allow users to read own device tokens"
  ON public.device_tokens FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Allow users to insert own device tokens"
  ON public.device_tokens FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Allow users to update own device tokens"
  ON public.device_tokens FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Allow users to delete own device tokens"
  ON public.device_tokens FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Keep updated_at current on upsert/update
CREATE OR REPLACE FUNCTION public.set_device_token_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_device_tokens_updated_at ON public.device_tokens;
CREATE TRIGGER trg_device_tokens_updated_at
  BEFORE UPDATE ON public.device_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.set_device_token_updated_at();

COMMENT ON TABLE public.device_tokens IS 'FCM device tokens for push notifications, one row per device per user (registered from the Capacitor mobile app)';
