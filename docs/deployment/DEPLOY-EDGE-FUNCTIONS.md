# Quick Deployment Guide - Edge Functions

## What You Need to Do

You need to deploy the edge functions to Supabase: 2 for the User Management system (so it can
create users automatically), and `redeem-invite` for lite-user self-registration from an invite
link.

> **Edge Functions do NOT deploy with the app.** `git push kiro prototype` publishes the web app
> only. Every function below has to be deployed separately with `supabase functions deploy`.
> The symptom of forgetting is the client calling a function that does not exist - the browser
> gets a 404 from `/functions/v1/<name>` and the user sees a failure with no server logs to show
> for it.

## Step-by-Step Instructions

### 1. Install Supabase CLI (One-time setup)

Open PowerShell and run:
```powershell
npm install -g supabase
```

### 2. Login to Supabase

```powershell
supabase login
```

This will open your browser to authenticate.

### 3. Link Your Project

```powershell
cd "C:\Users\miker\OneDrive\West Coast Rangers\App experiment\Kiro"
supabase link --project-ref pikrxkxpizdezazlwxhb
```

### 4. Deploy the Functions

```powershell
supabase functions deploy create-user
supabase functions deploy bulk-create-users
supabase functions deploy redeem-invite
```

You should see:
```
Deploying create-user (project ref: pikrxkxpizdezazlwxhb)
Deployed Function create-user
Deploying bulk-create-users (project ref: pikrxkxpizdezazlwxhb)
Deployed Function bulk-create-users
Deployed Functions on project pikrxkxpizdezazlwxhb: redeem-invite
```

### 5. Verify Deployment

Go to your Supabase Dashboard:
1. Navigate to: https://supabase.com/dashboard/project/pikrxkxpizdezazlwxhb
2. Click "Edge Functions" in the left sidebar
3. You should see:
   - create-user
   - bulk-create-users
   - redeem-invite

Or from PowerShell:
```powershell
supabase functions list
```
Each function should show `ACTIVE`.

### 6. Test in Your App

1. Open your app: https://clubfootball.app
2. Login as admin
3. Go to User Management page
4. Click "Add User"
5. Fill in the form:
   - Email: test@example.com
   - First Name: Test
   - Last Name: User
   - Role: Player
   - Leave password blank (will generate random)
6. Click "Create User"
7. You should see: "User created successfully!"

### 7. Test CSV Import

1. Click "Import CSV"
2. Paste this test data:
```csv
email,first_name,last_name,role,active,team,cellphone,password
test1@wcr.com,Test,One,player,true,,021-111-1111,
test2@wcr.com,Test,Two,coach,true,,021-222-2222,TestPass123
```
3. Click "Import Users"
4. You should see: "Import complete! Successfully created: 2 users"

### 8. Verify Users Were Created

Check in Supabase Dashboard:
1. Go to Authentication → Users
2. You should see test@example.com, test1@wcr.com, test2@wcr.com
3. Go to Table Editor → users
4. You should see the same users with their details

## redeem-invite (Lite User Registration)

`redeem-invite` runs the whole invite-redemption transaction server-side under `service_role`:
it validates the code, creates or resolves the auth user, inserts the `users` profile row and the
`team_members` row, then marks the invite redeemed - rolling back anything it created if a step
fails. Without it, self-registration from an invite link fails with *"new row violates row-level
security policy for table users"*, because the browser is still the `anon` role at that point.

Spec: `.kiro/specs/lite-user-registration-fix/`.

### Deploy it

```powershell
supabase functions deploy redeem-invite
```

Expected output:
```
Uploading asset (redeem-invite): supabase/functions/redeem-invite/index.ts
Uploading asset (redeem-invite): supabase/functions/redeem-invite/logic.ts
Deployed Functions on project pikrxkxpizdezazlwxhb: redeem-invite
```

Notes:
- **Default JWT verification is correct here - do NOT use `--no-verify-jwt`.** This endpoint is
  called before the person has an account, so there is no user session, but supabase-js sends the
  anon key as the bearer token and that satisfies verification. Verified on deploy: a POST with
  the anon key reaches the handler and returns the handler's own validation errors, not a 401.
  A POST with no `Authorization` header at all is rejected by the gateway with
  `UNAUTHORIZED_NO_AUTH_HEADER`, which is expected and harmless.
- `supabase/functions/redeem-invite/logic.test.ts` (vitest + fast-check) sits next to the source
  on purpose. It is **not** uploaded - the CLI bundles only what the entrypoint imports - so it
  does not affect the deploy. Leave it where it is.
- No new secrets. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.
- The invite code is the authorization. Rate limiting is a known, accepted gap.

### Verify it responds

```powershell
supabase functions list
```
`redeem-invite` should be `ACTIVE`.

Then probe it with a deliberately invalid code so nothing is written. From PowerShell, using the
values in `.env.production`:

```powershell
$url  = "https://pikrxkxpizdezazlwxhb.supabase.co/functions/v1/redeem-invite"
$anon = "<VITE_SUPABASE_ANON_KEY from .env.production>"
Invoke-WebRequest -Uri $url -Method Options -Headers @{ Authorization = "Bearer $anon"; apikey = $anon } -UseBasicParsing
```

Expected: `200` with body `ok` (the CORS preflight).

A POST with an invalid code should come back `400` with a plain-language message:
```json
{"error":"This invite code is not valid. Please check the link and try again.","status":"invalid"}
```

Anything that looks like a 404, or the client-side error "Edge Function returned a non-2xx status
code" with no function logs in the Dashboard, means the function is not deployed.

## Troubleshooting

### Registration fails and there are no `redeem-invite` logs
- The function was never deployed, or a code change was not redeployed. Run
  `supabase functions deploy redeem-invite` and check `supabase functions list` shows a bumped
  version number.
- Remember `git push kiro prototype` does not deploy it.

### "Command not found: supabase"
- Close and reopen PowerShell after installing
- Or run: `npm install -g supabase` again

### "Project not linked"
- Make sure you're in the correct directory
- Run: `supabase link --project-ref pikrxkxpizdezazlwxhb`

### "Permission denied"
- Make sure you're logged in: `supabase login`
- Check you have access to the project in Supabase Dashboard

### "Function not found" when testing
- Wait 1-2 minutes after deployment
- Check functions are deployed in Supabase Dashboard
- Try deploying again

## What This Enables

Once deployed, you can:
- ✅ Invited lite users can self-register from an invite link without the RLS failure
- ✅ Add individual users via the form (no more manual UUID copying!)
- ✅ Import 200+ users via CSV in minutes
- ✅ Users are automatically created in both Auth and users table
- ✅ Team assignments happen automatically
- ✅ Random passwords generated if not provided

## Ready for Production

After testing with a few users, you can:
1. Prepare your CSV file with all 200 users
2. Import in batches of 50 (easier to handle errors)
3. Each batch takes ~30 seconds to process
4. You'll get a detailed report of successes and failures

## Need Help?

If you run into issues:
1. Check the Supabase Dashboard → Edge Functions → Logs
2. Check browser console for errors
3. Try the test users first before bulk import
