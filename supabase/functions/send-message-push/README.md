# send-message-push

Sends a push notification (via Firebase Cloud Messaging) to all recipients
of a new team message. Triggered by a Supabase Database Webhook.

## Setup (one-time, manual steps required)

### 1. Get a Firebase service account key

FCM's current API (HTTP v1) requires OAuth via a service account, not the
old "server key" (Google shut that down in mid-2024).

1. Go to the [Firebase Console](https://console.firebase.google.com) →
   `club-football-app` project → **Project Settings** (gear icon) →
   **Service Accounts** tab
2. Click **Generate new private key** — downloads a JSON file
3. **Treat this file as a secret.** It grants broad access to the Firebase
   project. Do not commit it to git, do not paste it into chat, do not
   email it. Store it only in Supabase's secrets vault (next step) and
   then delete the local copy.

### 2. Store it as a Supabase secret

In the Supabase dashboard → your project → **Edge Functions** → **Secrets**,
or via the CLI:

```bash
supabase secrets set FCM_SERVICE_ACCOUNT_JSON="$(cat path/to/downloaded-key.json)"
```

(On Windows PowerShell: `supabase secrets set FCM_SERVICE_ACCOUNT_JSON=(Get-Content path\to\key.json -Raw)`)

Delete the local JSON file once this is done.

### 3. Deploy the function

```bash
supabase functions deploy send-message-push
```

### 4. Configure the Database Webhook

In the Supabase dashboard → **Database** → **Webhooks** → **Create a new webhook**:

- **Name**: `send-message-push`
- **Table**: `message_recipients`
- **Events**: `Insert`
- **Type**: HTTP Request
- **URL**: the deployed function's URL (shown after `functions deploy`)
- **HTTP method**: POST
- **HTTP headers**: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (or
  use Supabase's built-in webhook signing if preferred)

## What it does

1. Fires when a new row is inserted into `message_recipients`
2. Looks up the parent message (`title`, `body`)
3. Looks up device tokens for everyone in `recipient_user_ids`
4. Sends a push to each device via FCM
5. Marks `notification_pending = false` on that recipient row (prevents
   re-sending if the webhook retries)

## Known limitations (not yet handled)

- No retry/backoff on FCM send failures — a failed send is logged but not
  retried
- No cleanup of stale/invalid device tokens (FCM will return an error for
  uninstalled apps' tokens — worth adding a cleanup pass later)
- Not yet tested end-to-end on a real device, since push notification
  registration itself hasn't been tested on hardware yet
