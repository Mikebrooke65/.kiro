# Next Session Notes
## Current State — May 2026

---

## Quick Reference

**App URL**: https://wcrfootball.netlify.app  
**Branch**: `prototype`  
**Single remote (`kiro`), push here every time**:
```bash
git push kiro prototype
```
*(As of 2026-08-13, the old dual-remote setup is retired — see
`docs/deployment/DEPLOYMENT-GUIDE.md`.)*

---

## What's Built (Complete)

| Feature | Status | Notes |
|---------|--------|-------|
| Mobile app (all 6 areas) | ✅ Complete | Landing, Coaching, Games, Resources, Schedule, Messaging |
| Desktop admin (all 12 areas) | ✅ Complete | Includes Reporting, Competitions, Tournaments |
| Authentication & RBAC | ✅ Complete | 5 roles: player, caregiver, coach, manager, admin |
| Team Messaging | ✅ Complete | Realtime, threads, archive, reactions, read receipts |
| Game Day Subs | ✅ Complete | Live timer, rotation alerts, coach strategy mode |
| User Role Management | ✅ Complete | Dual role system, lite users, invite codes |
| Lesson Builder CRUD | ✅ Complete | Create, edit, copy, allocation system |
| Admin Reporting (Phase 1+2) | ✅ Complete | 6 reports: delivery, coach activity, team training, lesson effectiveness, session ratings, game feedback |
| Tournament Management (Phase 1) | ✅ Complete | Round-robin, standings, fixture generation |
| Academy Lessons (Bailey) | ✅ Complete | 38 lessons, 152 sessions (migrations 028-030) |
| Community Lessons (U9) | ✅ Complete | 16 lessons across 8 skills |

---

## Outstanding Work

### 1. Tournament — Needs User Testing
**Status**: Code complete, not yet tested with real data  
**Steps**:
1. Run migration `040` in Supabase SQL Editor
2. Create a Club Tournament on Competitions page
3. Add 3+ teams (use "Add Tournament Team" for external teams)
4. Go to Tournaments page → configure format (Single Round Robin)
5. Set match day dates, start time, duration, venue, pitches → Generate Fixtures
6. Verify fixtures appear grouped by round
7. Verify standings table shows all teams at 0-0-0-0
8. Record scores on Games page → verify standings update
9. Test mobile `/tournaments` page (standings + fixtures tabs)
10. Test lite user invite flow: create tournament team → share link → register

### 2. Schedule/Games ↔ Tournament Integration — TO DO
- Add competition name badge on tournament fixtures in Schedule page
- Add "Tournament" filter to Schedule event type filter
- Add competition indicator on Games page for tournament fixtures
- Trigger standings recalculation when score saved from Games page

### 3. Reporting Phase 3 — TO DO
- PDF export for reports
- Session Popularity report
- Lite Users report

### 4. Team Messaging — Needs Live Testing
- Thread detail view, reply, archive/unarchive
- Realtime subscriptions working
- Desktop two-panel layout
- UnreadBadge in bottom nav

### 5. Game Day Subs — Needs Live Testing
- Live count-up timer
- Substitution alerts (orange banner + audio beep)
- Coach strategy mode
- Playing time bars
- Guest players

### 6. Academy Lesson Images — Pending Bailey
- 13 slides still missing scraped content (Bailey needs to re-scrape)
- Images not yet uploaded to Supabase Storage
- See `docs/lessons/ACADEMY-MIGRATION-PROGRESS.md` for full status

---

## Future / Backlog

- Notification preferences UI
- Audit trail for role changes
- RLS policy audit (remove any remaining `user_teams` references)
- SMS gateway integration (Twilio/AWS SNS)
- Bulk CSV user import UI
- Session Builder save functionality
- Admin-configurable venue list
- Tournament Phase 2: Knockout brackets, group stages, referee assignment
- Tournament Phase 3: Public view, online registration, Stripe payments

---

## Key Files

| Purpose | Location |
|---------|----------|
| Project standards + deployment rules | `.kiro/steering/project-standards.md` |
| Feature history | `CHANGELOG.md` |
| Session-by-session decisions | `CONVERSATION-HISTORY.md` |
| Deployment instructions | `docs/deployment/DEPLOYMENT-GUIDE.md` |
| Bailey lesson progress | `docs/lessons/ACADEMY-MIGRATION-PROGRESS.md` |
| Lesson creation guide | `docs/lessons/LESSON-CREATION-GUIDE.md` |
| Original handover spec | `docs/project/KIRO_HANDOVER.md` |

---

## Docs Structure (after May 2026 cleanup)

```
docs/
  project/        ← planning, requirements, analysis docs
  deployment/     ← deployment, setup, troubleshooting
  lessons/        ← Bailey content, lesson guides, image prompts
    image-prompts/  ← U9 image prompt files
  archive/        ← old/superseded docs
```
