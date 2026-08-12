# Deployment Guide

## Repository Configuration

### Current Setup
This project uses **TWO** GitHub repositories:

1. **Primary Repository (Netlify)**: `github.com/Mikebrooke65/.kiro`
   - This is what Netlify watches for deployments
   - Branch: `prototype`
   - Deploys to: https://wcrfootball.netlify.app

2. **Secondary Repository**: `github.com/Mikebrooke65/coaching-app-prototype`
   - Used for backup/alternative hosting
   - Not connected to Netlify

### Git Remotes Configuration

Your local repository should have these remotes:

```bash
git remote -v
```

Should show:
```
kiro    https://github.com/Mikebrooke65/.kiro.git (fetch)
kiro    https://github.com/Mikebrooke65/.kiro.git (push)
origin  https://github.com/Mikebrooke65/coaching-app-prototype.git (fetch)
origin  https://github.com/Mikebrooke65/coaching-app-prototype.git (push)
```

### Setting Up Remotes (If Missing)

If you don't have the `kiro` remote:
```bash
git remote add kiro https://github.com/Mikebrooke65/.kiro.git
```

## Deployment Workflow

### Standard Deployment (To Production)

1. **Make your changes** and commit:
   ```bash
   git add -A
   git commit -m "your commit message"
   ```

2. **Push to BOTH repositories**:
   ```bash
   # Push to Netlify repository (REQUIRED for deployment)
   git push kiro prototype
   
   # Push to backup repository (optional but recommended)
   git push origin prototype
   ```

3. **Verify deployment**:
   - Netlify should auto-deploy within 1-2 minutes
   - Check https://app.netlify.com for build status
   - If auto-deploy doesn't trigger, manually trigger from Netlify dashboard

### Quick Deploy Command

To push to both repositories at once:
```bash
git push kiro prototype && git push origin prototype
```

## Common Issues

### Issue: Netlify Not Deploying

**Symptom**: You pushed code but Netlify shows old commit hash

**Cause**: You pushed to wrong repository (origin instead of kiro)

**Solution**:
```bash
# Check which remote you pushed to
git log --oneline -1

# Push to correct remote
git push kiro prototype

# Manually trigger deploy in Netlify if needed
```

### Issue: "Everything up-to-date" but Netlify Still Old

**Cause**: Netlify cache or webhook issue

**Solution**:
1. Go to Netlify dashboard
2. Site settings → Build & deploy
3. Click "Trigger deploy" → "Clear cache and deploy site"

### Issue: Wrong Remote Configured

**Symptom**: `git push` goes to wrong repository

**Solution**:
```bash
# Check current remotes
git remote -v

# Remove incorrect remote
git remote remove <remote-name>

# Add correct remote
git remote add kiro https://github.com/Mikebrooke65/.kiro.git
```

## Netlify Configuration

### Current Settings
- **Repository**: github.com/Mikebrooke65/.kiro
- **Branch**: prototype
- **Build command**: npm run build
- **Publish directory**: dist
- **Production URL**: https://wcrfootball.netlify.app

### Changing Repository (If Needed)

If you want to switch Netlify to watch `coaching-app-prototype` instead:

1. Go to Netlify dashboard
2. Site settings → Build & deploy → Link repository
3. Disconnect current repository
4. Connect to `coaching-app-prototype`
5. Set branch to `prototype`
6. Update this documentation

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
- [ ] Pushed to `kiro` remote (for Netlify)
- [ ] Pushed to `origin` remote (for backup)

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
- **Production site**: https://wcrfootball.netlify.app
- **Deploy notifications**: Check Netlify email notifications

## Notes

- Always push to `kiro` remote for production deployments
- Netlify auto-deploys on push to `prototype` branch
- Build time is typically 1-2 minutes
- Clear cache if deployment seems stuck on old version
- Keep both repositories in sync for backup purposes
