# User Management Solution

## Problem
Previously, adding users required a manual two-step process:
1. Create user in Supabase Auth Dashboard (get UUID)
2. Manually copy UUID and insert into users table

This doesn't scale to 200+ users.

## Solution
Implemented automated user creation using Supabase Edge Functions that handle both steps atomically.

## Features

### 1. Single User Creation
- Admin fills out form in User Management page
- Click "Create User"
- System automatically:
  - Creates user in Supabase Auth
  - Creates matching record in users table
  - Assigns to team (if selected)
  - Generates random password (if not provided)

### 2. Bulk CSV Import
- Admin clicks "Import CSV"
- Pastes CSV data with format:
  ```
  email,first_name,last_name,role,active,team,cellphone,password
  john@example.com,John,Doe,coach,true,Rangers U10,021-123-4567,MyPass123
  jane@example.com,Jane,Smith,player,true,Rangers U12,021-987-6543,
  ```
- System processes all users in batch
- Shows success/failure report

### 3. User Editing
- Update user details (name, phone, role, status)
- Reassign to different team
- Changes saved to users table

## Technical Implementation

### Edge Functions
Two Supabase Edge Functions handle user creation securely:

1. **create-user** - Single user creation
   - Located: `supabase/functions/create-user/index.ts`
   - Validates admin permissions
   - Creates auth user + users table record atomically
   - Handles team assignment

2. **bulk-create-users** - Batch user creation
   - Located: `supabase/functions/bulk-create-users/index.ts`
   - Processes multiple users
   - Provides detailed success/failure report
   - Rolls back failed creations

### Security
- Functions use Service Role Key (server-side only)
- Verify caller is authenticated admin
- Never expose service key to client
- Automatic rollback on failures

### Frontend
- Updated `src/pages/desktop/UserManagement.tsx`
- Calls edge functions via fetch API
- Passes auth token for verification
- Shows user-friendly success/error messages

## Deployment Steps

### 1. Deploy Edge Functions
```bash
# Install Supabase CLI (if not already installed)
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref pikrxkxpizdezazlwxhb

# Deploy functions
supabase functions deploy create-user
supabase functions deploy bulk-create-users
```

### 2. Test in App
1. Login as admin
2. Go to User Management page
3. Try creating a single user
4. Try importing CSV with 2-3 test users
5. Verify users appear in:
   - User Management table
   - Supabase Dashboard → Authentication → Users
   - Supabase Dashboard → Table Editor → users

## CSV Format

### Required Fields
- email
- first_name (or firstname)
- last_name (or lastname)

### Optional Fields
- role (default: player)
- active (default: true) - can be true/false or active/inactive
- team - team name (partial match OK)
- cellphone (or phone)
- password - if blank, random password generated

### Example CSV
```csv
email,first_name,last_name,role,active,team,cellphone,password
coach1@wcr.com,Mike,Brooke,coach,true,Rangers U10 Blue,021-123-4567,Coach123
player1@wcr.com,Tom,Smith,player,true,Rangers U10 Blue,021-234-5678,
player2@wcr.com,Sarah,Jones,player,true,Rangers U12 Red,021-345-6789,Player456
caregiver1@wcr.com,Jane,Doe,caregiver,true,,021-456-7890,
```

## Benefits

1. **Scalability**: Can import 200+ users in minutes
2. **Atomic Operations**: Auth + table creation happen together
3. **Error Handling**: Failed creations don't leave orphaned records
4. **Security**: Service key never exposed to client
5. **User Experience**: Simple form and CSV import
6. **Audit Trail**: Detailed success/failure reporting

## Next Steps

1. Deploy the edge functions to Supabase
2. Test with small batch (5-10 users)
3. Prepare CSV file with all 200 users
4. Import in batches of 50 for easier error handling
5. Verify all users can login

## Troubleshooting

### Function Not Found
- Ensure functions are deployed: `supabase functions list`
- Check project is linked: `supabase projects list`

### Permission Denied
- Verify you're logged in as admin
- Check users table has your user with role='admin'

### Import Fails
- Check CSV format matches example
- Ensure no duplicate emails
- Verify team names exist in teams table

### Users Can't Login
- Check email is confirmed in Supabase Auth
- Verify password was set (or user received reset email)
- Check active=true in users table
