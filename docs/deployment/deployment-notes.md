# Netlify Deployment Notes

## Date
March 2, 2026

## Summary
Successfully deployed the football coaching app prototype to Netlify.

## Repository
- GitHub: https://github.com/Mikebrooke65/coaching-app-prototype
- Branch: main (from local prototype branch)

## Issues Encountered and Solutions

### Issue 1: Wrong Repository
- Problem: Initially connected to wrong repo (Urrah-coaching-app)
- Solution: Connected to correct repo (coaching-app-prototype)

### Issue 2: Vite Base Path Configuration
- Problem: Build failed because vite.config.ts had `base: '/coaching-app-prototype/'` (configured for GitHub Pages)
- Solution: Changed to `base: '/'` for Netlify deployment
- File: vite.config.ts

### Issue 3: Hard-coded Asset Paths in index.html
- Problem: index.html referenced pre-built assets with absolute paths instead of source entry point
- Solution: Changed from hard-coded asset references to source entry point `/src/main.tsx`
- File: index.html

## Build Configuration
- Build command: `npm run build`
- Publish directory: `dist`
- Branch: main

## Next Steps
- Gather user feedback on the deployed prototype
- Make iterative improvements based on feedback
- Changes can be made directly to the code and will auto-deploy via Netlify when pushed to GitHub

## Notes
- App is responsive and can be viewed in mobile size using browser dev tools (F12 → device toolbar)
- Netlify auto-deploys on every push to the main branch
