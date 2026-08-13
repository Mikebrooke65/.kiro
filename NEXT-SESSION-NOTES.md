# Next Session Notes
## Current State — 13 August 2026

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

## Strategic Context (2026-08-13)

The app has a lot of functionality built, arguably progressed faster than
real-world usage. Decision made today: **stop expanding features, focus on
getting V1 in front of real coaches/managers/families to replace Heja.**

Two things drove this reprioritization:
1. Reviewed the app against Heja (the main competition) — the two critical
   gaps are **RSVP/availability** and **push notifications**. Without
   these, this isn't a credible Heja replacement no matter how much other
   functionality exists.
2. A web app isn't taken seriously as "a real app" by families — it needs
   to be distributed like Heja/TeamApp (App Store, Google Play, push
   notifications working properly). Decided on **Capacitor** wrapping the
   existing React/Vite app, **Firebase Cloud Messaging** for push.

Full scoping: `docs/project/CAPACITOR-SCOPING.md`

**Everything below is now split into V1 (get this shipped) and V2 (already
built, valuable, but not blocking launch).**

---

## V1 — Path to Launch

### V1.1 Capacitor + Push Notifications — IN PROGRESS
**Goal**: App installable on iOS/Android, push notifications working.

**Done and CONFIRMED WORKING end-to-end (as far as possible without a real device):**
- Capacitor initialized (`com.clubfootball.app`), Android + iOS platforms added
- Firebase project `club-football-app` created, both apps registered
- `device_tokens` table wired up (existing table from migration 033, now connected)
- Push notification registration built into the app (`usePushNotifications.ts`)
- Realtime reconnect-on-resume fix (Team Messaging won't freeze when backgrounded)
- `send-message-push` Edge Function deployed and ACTIVE
- FCM service account key stored in Supabase secrets
- Database trigger (migration 042) confirmed firing on real message sends —
  **verified live**: sent a real message through the app, trigger called
  the Edge Function via `pg_net`, got back HTTP 200 with
  `{"success":true,"devicesFound":0,"sent":0}`. The `0 devices found` is
  expected and correct — no device tokens exist yet because no native app
  has run on real hardware. The pipeline itself is proven end-to-end up to
  that point.
- Note: the dashboard's "Database Webhooks" feature is broken on this
  project (missing internal `supabase_functions.http_request()` — not
  fixable via ordinary SQL). Worked around by calling `pg_net` directly
  via a trigger instead (see migration 042 for full explanation).

**Blocked on hardware — next session when a Mac is available:**
1. Borrow a Mac, install Xcode
2. Run the app in Xcode simulator, then on a real device
3. Confirm push permission request + token registration actually works
   — should populate a row in `device_tokens`
4. Send a real test message and confirm this time `devicesFound` > 0 and
   a push notification actually arrives on the device
5. Repeat basic testing on an Android device/emulator

**Open decisions** (see `docs/project/CAPACITOR-SCOPING.md` section 6):
- Password reset UX inside the native app (recommend: leave as browser handoff for V1)
- Which events should trigger a push beyond new messages (event changes? RSVP reminders?)
- Privacy policy — needs to exist before store submission

### V1.2 RSVP / Availability — NOT STARTED
**Why this matters**: this is Heja's core feature. "Is my kid going to
training?" — every parent expects this. Without it, the app isn't a
credible Heja replacement regardless of what else it does.

**Scope** (not yet built):
- Add availability response (going / not going / maybe) to schedule events
- Surface RSVP status to coaches/managers per event
- Push notification trigger for RSVP reminders (once V1.1's push
  infrastructure is proven working)

### V1.2b Competitions/Teams/Users Process Review — IN PROGRESS
**Context (2026-08-13 evening)**: Before going further, need to confirm the
existing Competitions/Teams/Users setup actually supports how the club
really operates, for both flows below.

**Flow A — External Leagues (Federation-run)**:
- Federation sets competition name, dates, draws, fixtures — entirely
  external, we have no control and don't need to build any of it
- Club forms teams/rosters (players, managers, coaches) in **Friendly
  Manager** (external club management system, no API — CSV export only)
- Club manually enters those teams into the Federation's own system
  separately (unrelated to our app)
- Currently: families go to the Federation's site for fixtures, and
  whichever app the team manager picks (Heja etc.) for communication —
  our app has zero visibility into any of this today
- **Goal**: pull team + roster data out of Friendly Manager (CSV export)
  and get it into our app, ideally as a recurring sync (weekly?) rather
  than one-off — so our app becomes the coaching/communication home for
  Federation-competition teams too
- **Next step**: user to get a sample Friendly Manager export (or
  screenshot of the export screen) so we can design the import/sync
  against real data rather than assumptions — format, available fields
  (age group? manager email? stable IDs for matching on re-import?) all
  need confirming before designing anything

**Flow B — Club Tournaments (already built)**: club is the organizer, sets
dates, runs draws (round-robin engine already exists), teams join via the
invite-code flow (just reviewed/fixed today — Upcoming/Active/Ended/Closed
states, invites now open as soon as a competition is Upcoming).

**Second thread — "clean, open system for lite users"**: a consistent
onboarding path for anyone forming a team for one of *our own* Club
Competitions, not just the current ad-hoc invite flow. Needs defining
more precisely — what's missing vs. what already exists (invite codes,
lite user registration via `/invite/:code`, promote-to-full flow).

**Belief going in**: existing Competitions/Teams/Users architecture likely
already aligns with most of this — needs a review pass against real
Friendly Manager data, not necessarily new build.

### V1.3 Store Distribution — NOT STARTED
- Google Play Console account ($25 one-time) — needed once ready for
  testers, can wait until V1.1 is proven on a real Android device
- Apple Developer account ($99/year) — needed once testing push on a
  real iPhone; may already be needed by the time V1.1 hardware testing
  happens
- App icon, splash screen, screenshots, privacy policy, store listings

### V1 Feature Flags — NOT STARTED
Per the Heja comparison, some already-built features should be **hidden**
for the V1 trial launch, not removed — just switched off so the app feels
focused rather than overwhelming for a first-time user:
- Tournament management (park until proven demand)
- Admin reporting (admin-only, can wait)
- Session Builder / Lesson Builder complexity (keep basic delivery, hide advanced authoring)
- Competitions page

---

## V2 — Already Built, Valuable, Not Blocking Launch

Everything below was previously tracked as "Outstanding Work" — all of it
is real, done or partly done, and worth coming back to. None of it blocks
getting V1 in front of real users.

### What's Built (Complete, as of pre-2026-08-13 work)

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

### V2.1 Tournament — Needs User Testing
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

### V2.2 Schedule/Games ↔ Tournament Integration
- Add competition name badge on tournament fixtures in Schedule page
- Add "Tournament" filter to Schedule event type filter
- Add competition indicator on Games page for tournament fixtures
- Trigger standings recalculation when score saved from Games page

### V2.3 Reporting Phase 3
- PDF export for reports
- Session Popularity report
- Lite Users report

### V2.4 Team Messaging — Needs Live Testing
- Thread detail view, reply, archive/unarchive
- Realtime subscriptions working
- Desktop two-panel layout
- UnreadBadge in bottom nav

### V2.5 Game Day Subs — Needs Live Testing
- Live count-up timer
- Substitution alerts (orange banner + audio beep)
- Coach strategy mode
- Playing time bars
- Guest players

### V2.6 Academy Lesson Images — Pending Bailey
- 13 slides still missing scraped content (Bailey needs to re-scrape)
- Images not yet uploaded to Supabase Storage
- See `docs/lessons/ACADEMY-MIGRATION-PROGRESS.md` for full status

### V2 Backlog (Future)
- Notification preferences UI
- Audit trail for role changes
- RLS policy audit (remove any remaining `user_teams` references)
- SMS gateway integration (Twilio/AWS SNS)
- Bulk CSV user import UI
- Session Builder save functionality
- Admin-configurable venue list
- Tournament Phase 2: Knockout brackets, group stages, referee assignment
- Tournament Phase 3: Public view, online registration, Stripe payments
- Invite code deep links (App Links/Universal Links) — Step 3 of Capacitor scoping doc
- Multi-club support — if another club wants to adopt this app, needs a
  `clubs` table above `teams` and per-club branding/theming (currently
  hardcoded to West Coast Rangers). Not designed for today; App ID
  (`com.clubfootball.app`) was deliberately kept generic so this option
  stays open.

---

## Key Files

| Purpose | Location |
|---------|----------|
| Project standards + deployment rules | `.kiro/steering/project-standards.md` |
| Capacitor/push notification scoping | `docs/project/CAPACITOR-SCOPING.md` |
| Feature history | `CHANGELOG.md` |
| Session-by-session decisions | `CONVERSATION-HISTORY.md` |
| Deployment instructions | `docs/deployment/DEPLOYMENT-GUIDE.md` |
| Bailey lesson progress | `docs/lessons/ACADEMY-MIGRATION-PROGRESS.md` |
| Lesson creation guide | `docs/lessons/LESSON-CREATION-GUIDE.md` |
| Original handover spec | `docs/project/KIRO_HANDOVER.md` |
| Push notification Edge Function setup | `supabase/functions/send-message-push/README.md` |

---

## Docs Structure

```
docs/
  project/        ← planning, requirements, analysis docs
  deployment/     ← deployment, setup, troubleshooting
  lessons/        ← Bailey content, lesson guides, image prompts
    image-prompts/  ← U9 image prompt files
  archive/        ← old/superseded docs
```
