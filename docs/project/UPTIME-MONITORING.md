# Uptime Monitoring Setup

## Purpose
Keep Supabase database active by pinging the app weekly to prevent automatic pausing due to inactivity.

## Service: Cron-job.org (Free)

**Website**: https://cron-job.org

## Setup Instructions

1. **Sign up / Log in** to Cron-job.org (free account)
   - Go to https://cron-job.org
   - Click "Sign up" or "Login"

2. **Create New Cron Job**:
   - Click the "+ CREATE CRONJOB" button
   
3. **Fill in the form**:
   - **Title**: `WCR Football App - Weekly Ping`
   - **Address (URL)**: `https://clubfootball.app`
   
4. **Set the Schedule** (choose ONE method):

   **Method A - Use the dropdown selectors:**
   - Click on "Every Monday" from the quick options
   - OR manually set:
     - Minutes: `0`
     - Hours: `9` (or your preferred time)
     - Days: Leave blank
     - Months: Leave blank  
     - Weekdays: Select `Monday` (or check the Monday checkbox)

   **Method B - Use cron expression:**
   - Click "Advanced" or "Cron expression"
   - Enter: `0 9 * * 1`
   - This means: minute 0, hour 9, any day of month, any month, weekday 1 (Monday)

5. **Additional Settings** (optional):
   - Request method: `GET` (default)
   - Timeout: `30` seconds
   - Enable notifications: Your choice

6. **Save** the cron job

## Cron Expression Explained

`0 9 * * 1` breaks down as:
- `0` = minute (0-59)
- `9` = hour (0-23, in 24-hour format)
- `*` = any day of month (1-31)
- `*` = any month (1-12)
- `1` = weekday (0=Sunday, 1=Monday, 2=Tuesday, etc.)

## What This Does

- Pings your app every Monday at 9:00 AM
- Makes a GET request to your Netlify site
- This triggers Supabase connection, keeping it active
- Prevents Supabase from pausing your database due to inactivity

## Verification

After setup, you can:
- Check Cron-job.org dashboard to see execution history
- Monitor Supabase dashboard for activity
- Verify database stays active without manual intervention

## Notes

- Free tier allows multiple cron jobs
- Weekly pings are sufficient to keep Supabase active
- No code changes needed in your app
- Works alongside your existing deployment
- Same service used for RCA membership portal
