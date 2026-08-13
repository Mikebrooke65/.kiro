-- Migration 042: Direct pg_net trigger for send-message-push
--
-- This project's dashboard "Database Webhooks" feature is broken —
-- it depends on an internal Supabase-managed function
-- (supabase_functions.http_request()) that should be pre-provisioned
-- automatically but is missing here (confirmed: attempts to create the
-- schema and enable the `http` extension did not resolve it — this is
-- a gap in Supabase's own internal setup for this project, not
-- something fixable via ordinary SQL).
--
-- Rather than keep guessing at Supabase's internals, this migration
-- bypasses the dashboard webhook feature entirely and calls pg_net
-- directly — the same underlying, documented extension the webhook
-- feature itself is built on, and one we've confirmed IS properly
-- installed on this project.
--
-- The service role key is stored in Supabase Vault (the officially
-- documented mechanism for secrets referenced by database functions),
-- not hardcoded in this file or in the function body.
--
-- MANUAL STEP REQUIRED before this works: store the service role key
-- in Vault by running, in the SQL Editor, with YOUR_SERVICE_ROLE_KEY
-- replaced with the real value (find it in Project Settings > API):
--
--   SELECT vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');
--
-- Do this as a separate manual step in the SQL Editor — do not put the
-- real key into this migration file.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.trigger_send_message_push()
RETURNS TRIGGER AS $$
DECLARE
  project_url TEXT := 'https://pikrxkxpizdezazlwxhb.supabase.co';
  service_key TEXT;
BEGIN
  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF service_key IS NULL THEN
    RAISE WARNING 'service_role_key not found in Vault - push notification not sent for message_recipients.id=%', NEW.id;
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := project_url || '/functions/v1/send-message-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'message_recipients',
      'record', jsonb_build_object(
        'id', NEW.id,
        'message_id', NEW.message_id,
        'targeting_type', NEW.targeting_type,
        'recipient_user_ids', NEW.recipient_user_ids,
        'notification_pending', NEW.notification_pending
      )
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault, net;

DROP TRIGGER IF EXISTS trg_send_message_push ON public.message_recipients;
CREATE TRIGGER trg_send_message_push
  AFTER INSERT ON public.message_recipients
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_send_message_push();

COMMENT ON FUNCTION public.trigger_send_message_push() IS 'Calls the send-message-push Edge Function via pg_net directly (bypasses the broken dashboard Database Webhooks feature on this project). Service role key read from Vault, not hardcoded.';
