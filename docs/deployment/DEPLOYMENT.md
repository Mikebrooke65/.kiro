# DEPLOYMENT GUIDE

**Note (2026-08-13):** This project now uses a single GitHub repository and a
single remote (`kiro`). The old `origin` remote and dual-repo setup have been
retired — see `docs/deployment/DEPLOYMENT-GUIDE.md` for the full current
workflow. This file is kept for the file-location notes below.

## Git Push Command

```bash
git push kiro prototype
```

## Repository Setup

- **kiro**: https://github.com/Mikebrooke65/WCR-Football-App.git (only remote, watched by Netlify)

## Netlify Configuration

- **Site**: https://clubfootball.app (Netlify URL
  https://wcrfootball.netlify.app also still works)
- **Watches**: github.com/Mikebrooke65/WCR-Football-App
- **Branch**: prototype
- **Build command**: npm run build
- **Publish directory**: dist

## Deployment Workflow

1. Make changes to files
2. Test locally if needed: `npm run dev`
3. Commit: `git add -A && git commit -m "message"`
4. Push: `git push kiro prototype`
5. Wait 1-2 minutes for Netlify to build and deploy
6. Verify at https://clubfootball.app

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
4. Verify you pushed to `kiro`

## Test Credentials

- Email: mikerbrooke@outlook.com
- Password: Linda2024!
- Role: admin
