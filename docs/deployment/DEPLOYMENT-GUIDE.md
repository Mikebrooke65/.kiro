# Deployment Guide

## Repository Configuration

### Current Setup

**As of 2026-08-13**: This project uses **ONE** GitHub repository. The
previous two-repo setup was legacy clutter from initial project setup, not a
deliberate backup strategy, and the two repos silently drifted out of sync
more than once, causing real confusion. The old secondary repository
(`coaching-app-prototype`) has been renamed to `football-app-old` and
archived (read-only) on GitHub. It is retired and not used for anything.

**Repository**: `github.com/Mikebrooke65/WCR-Football-App`
- This is what Netlify watches for deployments
- Default branch: `prototype`
- Deploys to: **https://clubfootball.app** (also still reachable at
  https://wcrfootball.netlify.app)

### Git Remotes Configuration

Your local repository should have exactly one remote:

```bash
git remote -v
```

Should show:
```
kiro    https://github.com/Mikebrooke65/WCR-Football-App.git (fetch)
kiro    https://github.com/Mikebrooke65/WCR-Football-App.git (push)
```

There should be no `origin` remote. If one appears, remove it:
```bash
git remote remove origin
```

### Setting Up Remotes (If Missing)

If you don't have the `kiro` remote:
```bash
git remote add kiro https://github.com/Mikebrooke65/WCR-Football-App.git
```

## Deployment Workflow

### Standard Deployment (To Production)

1. **Make your changes** and commit:
   ```bash
   git add -A
   git commit -m "your commit message"
   ```

2. **Push**:
   ```bash
   git push kiro prototype
   ```

3. **Verify deployment**:
   - Netlify should auto-deploy within 1-2 minutes
   - Check https://app.netlify.com for build status
   - If auto-deploy doesn't trigger, manually trigger from Netlify dashboard

## Common Issues

### Issue: Netlify Not Deploying

**Symptom**: You pushed code but Netlify shows old commit hash

**Solution**:
```bash
# Check the last commit pushed
git log --oneline -1

# Push again to be sure
git push kiro prototype

# Manually trigger deploy in Netlify if needed
```

### Issue: "Everything up-to-date" but Netlify Still Old

**Cause**: Netlify cache or webhook issue

**Solution**:
1. Go to Netlify dashboard
2. Site settings → Build & deploy
3. Click "Trigger deploy" → "Clear cache and deploy site"

### Issue: Unexpected Remote Configured

**Symptom**: `git push` behaves unexpectedly, or an `origin` remote reappears

**Solution**:
```bash
# Check current remotes
git remote -v

# Remove anything that isn't `kiro`
git remote remove <remote-name>

# Confirm kiro points at the right place
git remote set-url kiro https://github.com/Mikebrooke65/WCR-Football-App.git
```

## Netlify Configuration

### Current Settings
- **Repository**: github.com/Mikebrooke65/WCR-Football-App
- **Branch**: prototype
- **Build command**: npm run build
- **Publish directory**: dist
- **Production URL**: https://clubfootball.app
- **Netlify URL**: https://wcrfootball.netlify.app (still works)

## Database Migrations

Database migrations are separate from code deployment:

1. **Create migration file**: `supabase/migrations/XXX_description.sql`
2. **Run in Supabase SQL Editor**: Copy/paste and execute
3. **Commit migration file**: Include in git commit
4. **Deploy code**: Push to kiro remote

Migrations must be run manually in Supabase - they don't auto-deploy.

## Pre-Deployment Checklist

Before pushing to production:

- [ ] Code tested locally (`npm run dev`)
- [ ] No console errors in browser
- [ ] Database migrations run in Supabase (if any)
- [ ] CHANGELOG.md updated
- [ ] CONVERSATION-HISTORY.md updated (for major changes)
- [ ] Committed to git
- [ ] Pushed to `kiro` remote

## Emergency Rollback

If deployment breaks production:

1. **Find last working commit**:
   ```bash
   git log --oneline
   ```

2. **Revert to that commit**:
   ```bash
   git reset --hard <commit-hash>
   git push kiro prototype --force
   ```

3. **Trigger Netlify deploy** from dashboard

## Monitoring Deployments

- **Netlify Dashboard**: https://app.netlify.com
- **Build logs**: Available in Netlify for each deployment
- **Production site**: https://clubfootball.app
- **DNS / registrar**: Cloudflare (see "Domain" in
  `.kiro/steering/project-standards.md` — keep the proxy OFF)
- **Deploy notifications**: Check Netlify email notifications

## Notes

- Push to `kiro` remote for production deployments — it's the only remote
- Netlify auto-deploys on push to `prototype` branch
- Build time is typically 1-2 minutes
- Clear cache if deployment seems stuck on old version

## Known Gotcha: Secrets Scanner False Positives on Firebase Config Files

If you add or modify `android/app/google-services.json` or
`ios/App/App/GoogleService-Info.plist` (Capacitor/Firebase config), be aware
that Netlify's secrets scanner will flag the API keys inside them as
"likely secrets" and **fail the build** — even though these files are
designed by Google to be public and committed to source control (they're
restricted by package name/bundle ID + SHA fingerprint, not by secrecy).

This already happened once (2026-08-13) and caused every deploy to fail
silently for about 2 hours before being caught.

**The fix is already in place** (`netlify.toml` → `SECRETS_SCAN_OMIT_PATHS`),
so this shouldn't recur for these two files. But if Netlify starts failing
builds again after adding a *new* Firebase-related config file, add its path
to the same `SECRETS_SCAN_OMIT_PATHS` list in `netlify.toml`.

**Do NOT** try to fix this via `SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES` with
the actual key value — that backfires, since putting the key into an
environment variable makes Netlify's separate always-on scanner flag that
env var's value appearing in the file, a self-referential trap.

If a build fails, check the deploy log for "Secrets scanning found secrets in
build" — that's the signature of this specific issue.
