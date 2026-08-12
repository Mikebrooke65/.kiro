# DEPLOYMENT GUIDE

## CRITICAL: Git Push Commands

**ALWAYS push to origin prototype branch (the .kiro repo that Netlify watches):**

```bash
git push origin prototype:prototype
```

**NEVER push to:**
- `prototype` remote - that's a different repo that Netlify doesn't watch!
- `origin main` branch - Netlify watches the `prototype` branch, not `main`!

## Repository Setup

- **origin**: https://github.com/Mikebrooke65/.kiro.git (NETLIFY WATCHES THIS)
- **prototype**: https://github.com/Mikebrooke65/coaching-app-prototype.git (NOT USED FOR DEPLOYMENT)

## Netlify Configuration

- **Site**: https://wcrfootball.netlify.app
- **Watches**: github.com/Mikebrooke65/.kiro
- **Branch**: prototype (NOT main!)
- **Build command**: npm run build
- **Publish directory**: dist

## Deployment Workflow

1. Make changes to files
2. Test locally if needed: `npm run dev`
3. Commit: `git add -A && git commit -m "message"`
4. Push: `git push origin prototype:prototype`
5. Wait 1-2 minutes for Netlify to build and deploy
6. Verify at https://wcrfootball.netlify.app

## File Locations (IMPORTANT!)

The app uses `src/routes/index.tsx` which imports from:
- `src/pages/` - Mobile pages
- `src/pages/desktop/` - Desktop admin pages
- `src/layouts/` - Layout components
- `src/components/` - Shared components

**DO NOT edit files in `src/app/` - those are old/unused!**

## Troubleshooting

If changes don't appear:
1. Check Netlify deploy log - is it building the latest commit?
2. Check browser cache - hard refresh (Ctrl+Shift+R)
3. Check the JS bundle hash in Network tab - should change with each deploy
4. Verify you pushed to origin, not prototype

## Test Credentials

- Email: mikerbrooke@outlook.com
- Password: Linda2024!
- Role: admin
