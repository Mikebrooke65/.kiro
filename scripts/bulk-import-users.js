/**
 * Bulk User Import Script
 * 
 * This script imports multiple users by calling the Netlify Function repeatedly.
 * Run with: node scripts/bulk-import-users.js
 * 
 * Requirements:
 * 1. You must be logged in as an admin user
 * 2. Copy your access token from the browser (see instructions below)
 */

const users = [
  {
    email: 'dof@westcoastrangers.co.nz',
    first_name: 'Andy',
    last_name: 'Dunn',
    role: 'admin',
    active: true,
    password: 'Footba11!',
  },
  {
    email: 'academy@westcoastrangers.co.nz',
    first_name: 'Bailey',
    last_name: 'Gaughan',
    role: 'admin',
    active: true,
    password: 'Footba11!',
  },
  {
    email: 'admin@westcoastrangers.co.nz',
    first_name: 'Michelle',
    last_name: 'Chandler',
    role: 'admin',
    active: true,
    password: 'Footba11!',
  },
  {
    email: 'jcorrigan.nz@gmail.nz',
    first_name: 'James',
    last_name: 'Corrigan',
    role: 'admin',
    active: true,
    password: 'Footba11!',
  },
];

// INSTRUCTIONS TO GET YOUR ACCESS TOKEN:
// 1. Open https://clubfootball.app in your browser
// 2. Log in as an admin user
// 3. Open browser DevTools (F12)
// 4. Go to Console tab
// 5. Type: localStorage.getItem('sb-pikrxkxpizdezazlwxhb-auth-token')
// 6. Copy the entire JSON string
// 7. Parse it and extract the access_token value
// 8. Paste it below replacing 'YOUR_ACCESS_TOKEN_HERE'

const ACCESS_TOKEN = 'YOUR_ACCESS_TOKEN_HERE';
const NETLIFY_FUNCTION_URL = 'https://clubfootball.app/.netlify/functions/create-user';

async function createUser(userData) {
  try {
    const response = await fetch(NETLIFY_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to create user');
    }

    return { success: true, user: result.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function bulkImport() {
  console.log(`Starting bulk import of ${users.length} users...\n`);

  const results = {
    success: 0,
    failed: 0,
    errors: [],
  };

  for (const user of users) {
    console.log(`Creating user: ${user.email}...`);
    
    const result = await createUser(user);
    
    if (result.success) {
      console.log(`✅ Success: ${user.email}`);
      results.success++;
    } else {
      console.log(`❌ Failed: ${user.email} - ${result.error}`);
      results.failed++;
      results.errors.push({ email: user.email, error: result.error });
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n=== Import Complete ===');
  console.log(`✅ Successful: ${results.success}`);
  console.log(`❌ Failed: ${results.failed}`);
  
  if (results.errors.length > 0) {
    console.log('\nErrors:');
    results.errors.forEach(err => {
      console.log(`  - ${err.email}: ${err.error}`);
    });
  }
}

// Validate token before running
if (ACCESS_TOKEN === 'YOUR_ACCESS_TOKEN_HERE') {
  console.error('❌ ERROR: Please set your ACCESS_TOKEN in the script');
  console.error('\nInstructions:');
  console.error('1. Open https://clubfootball.app in your browser');
  console.error('2. Log in as an admin user');
  console.error('3. Open browser DevTools (F12)');
  console.error('4. Go to Console tab');
  console.error('5. Run: JSON.parse(localStorage.getItem("sb-pikrxkxpizdezazlwxhb-auth-token")).access_token');
  console.error('6. Copy the token and paste it in this script');
  process.exit(1);
}

// Run the import
bulkImport().catch(console.error);
