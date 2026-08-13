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

### V1.2c Transactional Email (Send Invite / Send Link) — NOT STARTED
**Why this matters**: the admin currently has to manually copy an invite
link and paste it into their own email/text. For a real V1 launch with
potentially dozens of teams onboarding, this needs to be a "Send" button
that emails the manager directly from the app — branded, automated,
trackable.

**Scope**:
- Set up a transactional email provider (Resend, SendGrid, Postmark, or
  AWS SES — decision needed, lean toward Resend for simplicity)
- Supabase Edge Function to send emails (invite link, competition name,
  club branding)
- Replace "Copy Link" with "Send Link" on the Add Tournament Team and
  Invite modals — button sends the email immediately, shows confirmation
- Once the email service exists, it also unlocks: RSVP reminders,
  announcements via email, password reset email customization

### V1.2d Invite Landing Page — Branding & Context — NOT STARTED
**Why this matters**: when a manager clicks the invite link, they land on
a generic "Join [Team Name]" page with no club branding, no competition
context, and no sense of where they've arrived. For V1 launch this needs
to feel like a proper welcome to the club's competition:
- Club logo/branding on the landing page (not a blank white form)
- Competition name prominently shown (e.g. "Join the Summer Competitions")
- Brief context: what the app is, what they're signing up for, what
  happens next (they'll be able to add their own players)
- Visual consistency with the rest of the app so it feels legitimate,
  not a phishing page

### V1.2e Fix Lite User Self-Registration (RLS blocker) — BLOCKED
**Status**: the invite flow works up to the registration form, but
submitting fails with "violates row-level security policy for table
users". Root cause confirmed: `signUp()` with email confirmation enabled
does NOT grant a real session immediately, so the client is still
operating as `anon` when it tries to insert the profile row — the RLS
policy (`id = auth.uid()`) can't match because there's no authenticated
session yet.

**Key insight (2026-08-14)**: V1.2c (transactional email) and V1.2e
(this fix) collapse into essentially one piece of work, not two:
- If WE sent the invite email to the manager's address, and they clicked
  OUR link from that email, that act alone proves they own the email.
  Supabase sending a second "please confirm" is redundant friction.
- Fix: when creating the auth user via the Edge Function, use
  `email_confirm: true` (same flag the existing `create-user` Edge
  Function already uses) → Supabase skips confirmation → user gets an
  immediate session → profile INSERT works → no double-email.
- This only applies when the invite was sent via our email service (we
  can prove delivery to the correct address). For the "Copy Link"
  fallback (admin pastes link into a random chat, no proof of who
  clicked it), Supabase's confirmation step should still apply as a
  safety net.

**Practical outcome**: once V1.2c (email service) is built, the happy
path is entirely frictionless — one email, one click, registered and in
the app. The "Copy Link" path still works but retains the Supabase
confirmation as a valid extra step.

**Fix approach**: build a single Edge Function that handles the full
registration (auth user creation with `email_confirm: true` + profile
row + team membership + mark invite redeemed), called from the
registration form, using service_role. Same pattern as the existing
`create-user` Edge Function.

**Note**: the existing code correctly handles the "user already exists"
case (John Smith scenario) — if the email matches an existing full user,
it skips account creation and just adds the team membership. No
duplicate accounts.

### V1.2f Post-Registration Welcome & Manager Team Page — NOT STARTED
**What it is**: after a manager successfully registers, the current
success screen just says "You've been added to [Team Name], go to login"
— no context, no instructions, no next steps. This needs to become a
proper onboarding experience:

**Success screen should say** (dynamic, personalized):
> Welcome [FIRST NAME] and the [TEAM NAME]!
> You have been entered into the [COMPETITION NAME].
> Please use our app [APP LINK], and log in with the details you have
> set up. On the TEAM page you will see the teams you can manage —
> select your team and add players (names and email addresses). You can
> make one more player a Manager as well (maximum of two per team).
> Players will get emails to join, just as you have, and will get
> access to this App.

**New mobile page — "Team" (replaces Home in nav for managers)**:

**Layout:**
- Team selector dropdown at top (same pattern as Coaching page —
  auto-selects first/only team, shows all teams user is a member of)
- Roster list below, grouped by role: Coach → Manager → Player
- Users with multiple roles shown once with all roles listed (e.g.
  "John Smith — Coach, Manager"), NOT duplicated across groups
- Inactive users shown greyed out at bottom of list

**Role-based permissions on this page:**
- **Coach/Manager/Admin viewing a Club Tournament team**: full edit
  - Edit button next to each name: change name details, change role,
    mark as inactive (greyed, moved to bottom — NOT deleted, in case
    they come back)
  - "+ Add User" button at bottom → invite flow (name + email)
  - Max 2 managers per team enforced
- **Coach/Manager viewing an External League team**: read-only roster
  - No edit/add buttons — the Club (admin) manages these rosters, not
    the team manager (these come from Friendly Manager imports, the
    club controls registrations with the Federation)
- **Player/Caregiver (any team)**: read-only roster view
  - See names + roles (useful for knowing who coaches are, who to
    contact)
  - No edit/add buttons

**Key design rules:**
- No "remove" action — only "mark inactive" (soft disable, reversible)
- Editing only available for Club Tournament teams (manager self-serves)
- External League team rosters are club-managed (via desktop admin or
  Friendly Manager import — V1.2b)
- This page useful for ALL roles (everyone wants to see who's on their
  team) — just with different action permissions

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

### V1.2h Junior Players — User Model Decision (AGREED)
**Context**: most junior players (U16 and below) don't have their own
email address or phone. But the current `users` table requires an
`auth.users` row (which means an email + ability to sign in).

**Agreed approach for V1**:
- **Juniors get a real `users` row** (same as everyone else), but they
  **never log in themselves** — the caregiver's account is what receives
  all notifications, messages, and schedule updates
- For External League teams: data comes from Friendly Manager imports,
  admin creates the user row — email can be synthetic/placeholder (e.g.
  `player-{uuid}@app.internal`) since the child won't use it to sign in
- For Club Tournament teams: when a manager adds a junior player via the
  Team page, the form captures the **caregiver's** details (name, email,
  phone) + the **child's** minimum data (first name, last name). This
  creates:
  - A caregiver user (with real email — they're the one who signs in)
  - A player user (with synthetic email — they don't sign in)
  - A `player_caregivers` link between them
- `cellphone` on the junior's user row stays empty — the Team page
  displays the caregiver's contact info next to the child's name instead
- **Age threshold**: use `teams.age_group` to determine whether to show
  caregiver info. U17+ / Open = show player's own phone. U16 and below =
  show linked caregiver's name + phone.
- **No schema change needed** for V1 — the existing `users` table,
  `player_caregivers` relationship, and `caregiver_approvals` workflow
  all support this. It's purely a UI/flow question (what the Team page
  captures and displays differently for junior vs senior teams).

### V1.2g Role-Aware Mobile Navigation — NOT STARTED
**Constraint**: maximum of **6 nav buttons per role** — this is a hard
design rule, not a suggestion. The six-button bottom nav is the app's
primary navigation on mobile; it works well visually and for thumb reach.
Adding a seventh breaks it.

**Key decisions needed** (to be designed, not implemented today):

| Role | Proposed 6 buttons | Notes |
|------|-------------------|-------|
| Manager/Coach | Team, Coaching, Games, Schedule, Messaging, Resources | Team replaces Home (Home accessible via header icon) |
| Player | Home, Team (read-only roster/contacts), Schedule, Messaging, Resources, ??? | Coaching & Games hidden — not relevant to players |
| Caregiver | Home, Team (read-only), Schedule, Messaging, Resources, ??? | Similar to player — viewing, not managing |

**What this means**:
- Bottom nav component becomes role-aware (reads user role, renders
  different button sets)
- Coaching and Games pages are still *accessible* (via direct URL, via
  links from other pages) — they're just not in the primary nav for
  roles that don't use them
- The "Team" page (V1.2f) fits naturally into the nav for every role —
  managers see manage/add-players, players/caregivers see read-only
  roster with contact details
- Home page still exists, just accessed via the header logo/icon rather
  than a dedicated nav slot for manager/coach roles
- Announcements might take one of the player/caregiver slots, or fold
  into Home — needs deciding

**Not blocking V1 launch**: the current 6-button universal nav works for
the initial trial. This becomes important once the Team page (V1.2f) is
built and needs a home in the nav.

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
