# Troubleshooting Guide

## Critical Issues

### Issue 1: Session Persistence Not Working

**Symptom**: User gets logged out on page refresh, app stuck on "navigating..." or "Loading..."

**What We Know**:
- Login works successfully - user can authenticate
- Session IS being saved to localStorage (key: `sb-pikrxkxpizdezazlwxhb-auth-token`)
- `supabase.auth.getSession()` times out or hangs when trying to read session
- User must log in again after every page refresh

**Attempted Fixes**:
1. Added timeout recovery mechanism (3 seconds) - didn't work
2. Tried to manually restore session from localStorage - didn't work
3. Simplified Supabase client configuration - didn't work
4. Removed timeout recovery logic entirely - still not working

**Current Status**: UNRESOLVED

**Next Steps to Try**:
1. Check Supabase project auth settings in dashboard
2. Verify Supabase URL configuration in Netlify environment variables
3. Test with different browsers (Chrome, Firefox, Edge)
4. Check browser console for specific error messages
5. Try clearing all browser cache and localStorage
6. Check if issue exists in local development vs production
7. Review Supabase auth documentation for session management best practices
8. Consider using `supabase.auth.onAuthStateChange()` as primary session detection
9. Check network tab for failed API calls to Supabase

**Workaround**: User must log in after every page refresh

---

### Issue 2: Admin Pages Not Loading After Build

**Symptom**: After clean build and deployment, newly created admin pages don't load when clicking navigation links

**What We Know**:
- All 12 admin page files exist in repository
- Build completes successfully (no errors)
- Files are in correct location: `src/pages/desktop/*.tsx`
- Routes are configured in `src/routes/index.tsx`
- Pages work when accessed directly via URL
- URL changes when clicking navigation but page doesn't render

**Root Cause**: React Router's `<Outlet />` component wasn't re-rendering when route changed because React thought it was the same component instance.

**Solution**: Added `key={location.pathname}` to the `<Outlet />` in DesktopLayout.tsx to force React to unmount and remount the child component on route changes.

**Fix Applied**:
```tsx
// Before
<Outlet />

// After  
<Outlet key={location.pathname} />
```

**Current Status**: ✅ RESOLVED - All desktop admin pages now load correctly

---

**Pages Affected**:
- Session Builder (/desktop/session-builder)
- Lesson Builder (/desktop/lesson-builder)
- Teams Management (/desktop/teams)
- User Management (/desktop/users)
- Reporting (/desktop/reporting)
- Announcements (/desktop/announcements)

**What Happens**:
- User clicks on navigation item
- Page doesn't load or shows blank screen
- May show "navigating..." indefinitely
- Console may show errors

**Possible Causes**:
1. Session persistence issue preventing navigation
2. Route configuration mismatch
3. Import errors in route file
4. Build optimization removing unused code
5. Netlify caching old build
6. Missing environment variables in Netlify

**Debugging Steps**:
1. Check browser console (F12) for errors
2. Check Network tab for failed requests
3. Verify URL in address bar matches route configuration
4. Check if user is authenticated (session issue)
5. Try accessing pages directly via URL
6. Check Netlify build logs for warnings
7. Verify all imports in routes/index.tsx are correct

**Files to Check**:
- `src/routes/index.tsx` - Route configuration
- `src/layouts/DesktopLayout.tsx` - Navigation links
- `src/pages/desktop/*.tsx` - Page components
- `netlify.toml` - Redirect configuration
- `.env.development` - Environment variables

**Current Status**: UNRESOLVED - Pages built successfully but not loading in production

**Next Steps**:
1. Test locally with `npm run dev` to see if pages work
2. Check if issue is specific to production/Netlify
3. Review Netlify deployment logs for any warnings
4. Verify all page imports are correct
5. Check if session issue is blocking navigation
6. Try hard refresh (Ctrl+Shift+R) in browser
7. Check if pages work when accessed directly via URL

---

## Environment Information

**Supabase Project**:
- URL: https://pikrxkxpizdezazlwxhb.supabase.co
- Project ID: pikrxkxpizdezazlwxhb

**Netlify Deployment**:
- URL: https://wcrfootball.netlify.app
- Repository: https://github.com/Mikebrooke65/coaching-app-prototype
- Branch: main
- Build Command: `npm run build`
- Publish Directory: `dist`

**Test User**:
- Email: mikerbrooke@outlook.com
- Password: Linda2024!
- Role: admin

**Local Environment**:
- OS: Windows
- Shell: bash
- Node.js: (check with `node --version`)
- npm: (check with `npm --version`)
- Free Disk Space: ~2.3GB (LOW - may cause issues)

---

## Common Issues & Solutions

### Issue: "Loading..." Spinner Never Stops

**Cause**: Auth initialization hanging
**Solution**: Check AuthContext.tsx for timeout issues, verify Supabase connection

### Issue: Blank White Screen

**Cause**: JavaScript error preventing render
**Solution**: Check browser console for errors, verify all imports

### Issue: 404 Not Found

**Cause**: Route not configured or SPA routing not working
**Solution**: Check `public/_redirects` file exists with `/* /index.html 200`

### Issue: Build Fails with Syntax Error

**Cause**: TypeScript/JSX syntax errors
**Solution**: Run `npm run build` locally to see errors, fix syntax issues

### Issue: Environment Variables Not Working

**Cause**: Variables not set in Netlify or wrong prefix
**Solution**: Verify all `VITE_*` variables are set in Netlify dashboard

---

## Diagnostic Commands

Run these locally to diagnose issues:

```bash
# Check if build works
npm run build

# Check for TypeScript errors
npx tsc --noEmit

# Check for linting issues
npm run lint

# List all desktop page files
ls src/pages/desktop/*.tsx

# Check git status
git status

# Check current branch
git branch

# Check recent commits
git log --oneline -10

# Verify files in repository
git ls-tree -r HEAD --name-only | grep desktop
```

---

## Contact & Support

If issues persist:
1. Check Supabase status page
2. Check Netlify status page
3. Review Supabase documentation
4. Check React Router documentation
5. Review Vite build documentation


---

## Update: March 6, 2026 - Partial Resolution

### Desktop Navigation Issue - RESOLVED
- **Fix**: Added `key={location.pathname}` to `<Outlet />` in DesktopLayout.tsx
- **Result**: Session Builder, Lesson Builder, Teams, Users, Coaching now work correctly

### Reporting and Announcements Still Not Loading
- **Symptom**: URL changes correctly but pages don't render
- **Console**: No error messages, no component rendering logs
- **Tested**: Cache clearing, redeployment, incognito mode - no change
- **Current deployed bundle**: index-7sEEw2xR.js
- **Status**: UNRESOLVED - needs further investigation

**Possible causes to investigate**:
1. Build optimization removing these specific components
2. Route configuration issue specific to these two pages
3. Component code issue causing silent failure
4. Deployment not picking up latest changes for these files

**Next steps**:
1. Check if components are in the deployed bundle
2. Try accessing via direct URL after fresh login
3. Compare working pages (Teams, Users) with non-working (Reporting, Announcements)
4. Check if issue exists in local dev server
