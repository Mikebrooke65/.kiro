# Quick Deployment Guide - Edge Functions

## What You Need to Do

You need to deploy 2 edge functions to Supabase so the User Management system can create users automatically.

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
```

You should see:
```
Deploying create-user (project ref: pikrxkxpizdezazlwxhb)
Deployed Function create-user
Deploying bulk-create-users (project ref: pikrxkxpizdezazlwxhb)
Deployed Function bulk-create-users
```

### 5. Verify Deployment

Go to your Supabase Dashboard:
1. Navigate to: https://supabase.com/dashboard/project/pikrxkxpizdezazlwxhb
2. Click "Edge Functions" in the left sidebar
3. You should see:
   - create-user
   - bulk-create-users

### 6. Test in Your App

1. Open your app: https://wcrfootball.netlify.app
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

## Troubleshooting

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
