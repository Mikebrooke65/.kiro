-- Migration 041: device_tokens updated_at tracking
--
-- The device_tokens table already exists (created in migration 033 -
-- Team Messaging), with columns: id, user_id, device_token, platform,
-- created_at, unique(user_id, device_token). This migration only adds
-- what's missing for push notification token refresh handling: an
-- updated_at column plus a trigger to keep it current, so we can tell
-- how recently a token was confirmed still valid by the device.
--
-- Idempotent: uses IF NOT EXISTS / OR REPLACE throughout.

ALTER TABLE public.device_tokens
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

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

COMMENT ON TABLE public.device_tokens IS 'FCM device tokens for push notifications (table created in migration 033; registered from the Capacitor mobile app)';
