# Supabase Setup Guide

## ✅ What We've Done So Far

1. Created your Supabase account and project
2. Got your API credentials
3. Added them to your local environment files (.env.development and .env.production)
4. Created SQL migration files to set up your database

## 🎯 What You Need to Do Next

### Step 1: Run the Database Migrations

1. Open your Supabase project: **https://pikrxkxpizdezazlwxhb.supabase.co**

2. Click **SQL Editor** in the left sidebar (looks like a document icon)

3. Click **New Query** button

4. Open the file `supabase/migrations/001_initial_schema.sql` in your code editor

5. Copy ALL the contents of that file

6. Paste it into the Supabase SQL Editor

7. Click **Run** (or press Ctrl+Enter)

8. Wait for the green success message (should take 5-10 seconds)

9. Repeat steps 3-8 for `supabase/migrations/002_rls_policies.sql`

### Step 2: Verify the Setup

1. In Supabase, click **Table Editor** in the left sidebar

2. You should see these tables:
   - users
   - teams
   - user_teams
   - skills
   - sessions
   - lessons
   - lesson_sessions
   - delivery_records
   - session_feedback
   - lesson_feedback
   - game_feedback
   - announcements
   - player_caregivers

3. Click on the **skills** table - you should see 6 rows:
   - Passing and First Touch
   - Dribbling and Ball Control
   - Shooting
   - Defending
   - Attacking
   - Transitions

### Step 3: Create Your First Admin User

We'll do this once we build the authentication system, but for now just verify the tables are created.

## 🎉 Once Complete

Your database is ready! Next steps:
1. Install Supabase client library in your React app
2. Build the authentication system
3. Start creating features

## ❓ Troubleshooting

**"relation already exists" error**
- Tables are already created, you're good to go!

**Can't find SQL Editor**
- Look for the icon that looks like `</>` or a document in the left sidebar
- It might be under "Database" section

**Migration runs but no tables appear**
- Refresh the page
- Check the "public" schema is selected in Table Editor

## 📞 Need Help?

Just let me know what error message you see and I'll help you fix it!
