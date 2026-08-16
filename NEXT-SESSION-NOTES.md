# Next Session Notes
## Current State — 14 August 2026

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

**Deploys lag your browser cache.** After any push, hard-refresh
(Ctrl+Shift+R) before concluding something is broken. This has already
cost time twice.

---

## Strategic Context

The app has a lot of functionality built, arguably progressed faster than
real-world usage. Decision made 2026-08-13: **stop expanding features,
focus on getting V1 usable by real coaches/managers/families.**

Two things drove this:
1. Reviewed against Heja (the main competition) — the critical gaps are
   **RSVP/availability** and **push notifications**. Without these it
   isn't a credible Heja replacement no matter what else exists.
2. A web app isn't taken seriously as "a real app" by families — it needs
   App Store / Google Play distribution with working push. Decided on
   **Capacitor** wrapping the existing React/Vite app, **Firebase Cloud
   Messaging** for push.

**Launch approach (updated 2026-08-14): soft launch, no hard deadline.**
When the build is ready, pick the next available competition and trial it
with a few people. The earlier formal "10-week trial with <20 teams"
structure from `docs/project/PROJECT-ROLLOUT.md` has been superseded —
that document is now historical context, not the plan.

Junior coaching content (10 weeks) is already loaded and is fine as-is.

Full Capacitor scoping: `docs/project/CAPACITOR-SCOPING.md`

---

## V1 — Open Decisions Needed

These block or shape work below. Listed here so they don't stay buried.

| # | Decision | Blocks | Recommendation |
|---|----------|--------|----------------|
| 1 | **Email provider** — Resend, SendGrid, Postmark, or AWS SES? | V1.2 (and therefore V1.3, V1.4, V1.5) | **Resend** — simplest setup, generous free tier, good deliverability, minimal config |
| 2 | **Which events trigger a push in V1?** Candidates: new message (built), new schedule event, event change/cancellation, RSVP reminder | V1.1 completion | Start with new message (done) + event change/cancellation. RSVP reminders once V1.7 exists |
| 3 | **Privacy policy** — see V1.9 below for full explanation | V1.9 store submission | Needs a real decision, see advice in V1.9 |
| 4 | **Player/Caregiver nav — 2 undecided slots** | V1.5 | Options: Announcements, or fold Announcements into Home and leave 5 buttons |
| 5 | **Does RSVP apply to Club Tournament teams, or only club teams?** | V1.7 scope | Probably club teams only for V1 — social/summer teams may just turn up |
| 6 | **Friendly Manager export format** — waiting on sample | V1.T | User to obtain export sample or screenshot |
| 7 | ~~Which machine for Android Studio?~~ | V1.1a | **RESOLVED 2026-08-14** — use the other laptop (has adequate disk/RAM). This laptop stays the main build machine. See V1.1a |

---

## V1 — Build Order

Dependency chain. Items further down depend on items above them.

```
V1.1a Android device testing    ── needs a machine that can run Android Studio
V1.1b iOS device testing        ── needs Mac + Xcode (borrowed)
V1.2  Email Service             ── CRITICAL PATH, unblocks 3 items below
 └─ V1.3  Fix Self-Registration ── needs V1.2's email_confirm approach
     └─ V1.4  Welcome + Team Page ── needs registration to actually work
         └─ V1.5  Role-Aware Nav  ── needs Team page to exist first

Independent (can happen any time):
V1.6  Invite Landing Page Branding
V1.7  RSVP / Availability
V1.8  Feature Flags for Launch
V1.9  Store Distribution + Privacy Policy   ── last, needs V1.1a + V1.1b
V1.T  Friendly Manager Import   ── separate track, External Leagues only
```

**Nothing except V1.9 depends on V1.1.** Everything in V1.2–V1.8 and V1.T
is web-testable in a browser. Device testing can happen whenever hardware
becomes available without causing rework — the only known follow-ups after
device testing are global (safe-area insets for the iPhone notch, minor
touch-target tweaks), not per-feature rebuilds.

---

### V1.1 Capacitor + Push Notifications — IN PROGRESS (hardware-gated)

**Goal**: App installable on iOS/Android, push notifications working.

**Done and verified as far as possible without a device:**
- Capacitor initialized (`com.clubfootball.app`), Android + iOS platforms added
- Firebase project `club-football-app` created, both apps registered
- `device_tokens` table wired up (existing table from migration 033)
- Push registration built into the app (`usePushNotifications.ts`)
- Realtime reconnect-on-resume fix (Team Messaging won't freeze when backgrounded)
- `send-message-push` Edge Function deployed and ACTIVE
- FCM service account key stored in Supabase secrets
- Database trigger (migration 042) **verified live** — sent a real message,
  trigger called the Edge Function via `pg_net`, returned HTTP 200 with
  `{"success":true,"devicesFound":0,"sent":0}`. Zero devices is correct
  and expected: no tokens exist until the native app runs on hardware.
  The pipeline is proven end-to-end up to that point.
- Note: the dashboard's "Database Webhooks" feature is broken on this
  Supabase project (missing internal `supabase_functions.http_request()`,
  not fixable via ordinary SQL). Worked around with `pg_net` called
  directly from a trigger — see migration 042 for the full explanation.

The remaining work splits into two independent hardware tracks. Doing
**either** one answers the biggest open risk — "does the app actually work
correctly wrapped in a native WebView?" — so whichever becomes available
first is worth doing.

#### V1.1a — Android track (does NOT need a Mac)

Android Studio runs on Windows, so this doesn't depend on borrowing
anything. Doing this track first would de-risk the WebView question early,
and FCM push works on Android emulators with Play Services — so this can
prove `device_tokens` populates and `devicesFound` > 0 without any Apple
involvement.

**Step 0 — decide which machine (DO THIS FIRST)**

Checked this laptop on 2026-08-14 and **it will not fit as it stands**:

| Spec | This laptop | Android Studio needs |
|------|------------|---------------------|
| Disk free | **1.4 GB** (of 118 GB — 98.8% full) | ~8 GB min, realistically 20+ GB with SDK, emulator images, Gradle caches |
| RAM | 7.9 GB | 8 GB bare minimum; 16 GB recommended for IDE + emulator together |
| CPU | i5-8250U (2017 low-power, 4 cores) | Workable but emulator will be slow |

Clearing this project won't rescue it — measured: `node_modules` 251 MB,
`_archive` 9 MB, `dist`/`media`/`android`/`ios` ~2 MB each. Total
reclaimable ≈ 260 MB against a ~20 GB need.

**DECIDED (2026-08-14)**: use the **other laptop** — it has adequate
disk/RAM to run Android Studio comfortably. This laptop stays as the
main build machine.

**Working on the other laptop**: user has previously logged into a
browser-based Kiro, so that may be an option rather than a full desktop
install. The thing to confirm on the day is whether that version can
(a) read/write the local project files on that machine and (b) run local
shell commands (`npm`, `npx cap`, `git`) — because driving an Android
Studio build needs both. If it can't, fall back to installing Kiro
desktop there, cloning the repo, and copying `.env.development` across
(same as the Mac checklist in `docs/project/MAC-SESSION-CHECKLIST.md`,
minus Xcode/CocoaPods).

⚠️ **Separately and more urgently**: 1.4 GB free is low enough to cause
problems in its own right — failed installs, slow performance, Windows
update issues. This is plausibly behind the `npm install` /
`TAR_ENTRY_ERROR` failures hit while installing `firebase-tools` on
2026-08-13. Worth addressing regardless of Android Studio, since active
development is happening on this machine.

**Then:**
1. Install Android Studio + Android SDK
2. `npm run build && npx cap sync && npx cap open android`
3. Run in an emulator (or a real Android phone via USB)
4. Confirm the app loads, login works, navigation behaves in the WebView
5. Confirm push permission prompt appears and a row lands in
   `device_tokens`
6. Send a real message, confirm `devicesFound` > 0 and a push arrives

#### V1.1b — iOS track (needs a Mac)

See `docs/project/MAC-SESSION-CHECKLIST.md` for the full step-by-step.

1. Install Xcode, install Kiro, clone repo, copy `.env.development` across
2. Install CocoaPods, `npx cap open ios`
3. Run in simulator, then on a real device
4. Confirm push permission + token registration populates `device_tokens`
5. Send a test message, confirm `devicesFound` > 0 and a push arrives

**Note**: testing push on a *real* iPhone requires the paid Apple
Developer account ($99/yr) — the simulator can request permission but
can't receive real pushes. Safe-area insets (iPhone notch/home indicator)
are an iOS-specific polish item that comes out of this track.

---

### V1.0 Buy a Product Domain — DECIDED, ACTION NEEDED FIRST

**Decision (2026-08-14): Option A — buy a product domain**, not use the
club's domain. Something like `clubfootballapp.com`. ~$10–15/year.

**Why a product domain rather than the club's**: matches the
club-agnostic direction, needs no club/DNS cooperation (which — like the
privacy policy — is the kind of dependency that sits blocked for weeks),
and works for every club that ever uses this. Resend supports multiple
verified domains, so any club that later wants invites coming from their
own address can add theirs, while the product domain stays the default
that always works.

**One purchase unblocks four things**:

| Need | Currently | With the domain |
|------|-----------|----------------|
| Email sending (V1.2) | Test sender only reaches the Resend account owner's own inbox | Real invites to anyone |
| App URL | `wcrfootball.netlify.app` — club-specific *and* Netlify-branded | e.g. `app.<domain>` |
| Privacy policy hosting (V1.9) | Nowhere — both stores require a public URL | A page on the domain |
| Invite deep links (V2 backlog) | Not possible | App Links / Universal Links require a domain you control |

**Consistent with** the App ID already being generic
(`com.clubfootball.app`, deliberately not `nz.wcr.app`) — that can't be
changed after publishing, so a matching product domain keeps things
coherent.

**Then**: verify the domain in Resend (SPF/DKIM DNS records), set
`EMAIL_FROM` and optionally `EMAIL_REPLY_TO` as Supabase secrets.

---

### V1.2 Transactional Email Service — IN PROGRESS ⚠️ CRITICAL PATH

**Why this is first**: three other items (V1.3, V1.4, V1.5) sit behind
this. It's currently the single biggest unblocker in V1.

**The problem**: the admin has to manually copy an invite link and paste
it into their own email or text. For a launch with multiple teams
onboarding, this needs to be a "Send" button that emails the recipient
directly from the app — branded, automated, trackable.

**Provider: Resend** (decided 2026-08-14).

**Done**:
- ✅ `supabase/functions/send-email/index.ts` written — generic sender,
  `team_invite` template first; RSVP reminders and announcements slot
  into the same `type` switch later. Templates built **server-side** so
  the client sends `type` + data, never raw HTML (a compromised client
  can't push arbitrary content through the sending domain). User-supplied
  values HTML-escaped. Requires an auth header.
- ✅ Club-agnostic: `CLUB_NAME`, `CLUB_COLOR`, `APP_URL`, `EMAIL_FROM`,
  `EMAIL_REPLY_TO` all from env vars with generic fallbacks.

- ✅ **"Send Link" wired into `CompetitionsPage`** (2026-08-14) — three
  places, all with **"Copy Link" kept as a fallback** (genuinely useful,
  and it changes the security model — see V1.3):
  1. Add Tournament Team modal, after the team is created
  2. Per-team Invite modal, after the code is generated
  3. Each pending row in the Invites panel — so an invite can be
     **resent** later without regenerating the code
  Button label changes to "Resend Link" once sent. On failure the error
  explicitly tells the admin to fall back to Copy Link, so a Resend
  outage never blocks onboarding.
- ✅ `src/lib/email-api.ts` — client wrapper. Passes **only data** (team
  name, competition name, code, recipient); **no branding from the
  browser**, so branding has one source (the function's env vars).
  Also unwraps `functions.invoke` errors, which otherwise surface as an
  unhelpful "Edge Function returned a non-2xx status code".
- ✅ `npm run build` passes.

**Remaining** — all of it needs the domain (V1.0) or a Resend account:
1. Resend account + API key → set as `RESEND_API_KEY` Supabase secret
   (save the key to a **file**, pipe it to `supabase secrets set`, delete
   the file — don't paste it into chat)
2. `supabase functions deploy send-email`
3. Test send (works to your own Resend signup address without a domain)
4. Click "Send Link" in the app and confirm the email arrives

**Note on team names in the email**: passed as `"{age_group} {name}"`
(e.g. "Open Bozos") per the project display standard, not the bare name.

**Not verified**: no Deno runtime locally to type-check or execute the
function. Same caveat as `send-message-push`.

**Send-only by design** — no mailbox needed on the sending domain,
`noreply@` is fine. But SPF/DKIM are still required or mail lands in
spam, and replies bounce unless `EMAIL_REPLY_TO` points at a monitored
address. Decision needed on whether invites should be repliable.

**Also unlocks later**: RSVP reminders by email, announcements by email,
custom password-reset emails.

---

### V1.3 Fix Lite User Self-Registration — BLOCKED (needs V1.2)

**Current status**: the invite flow works right up to the registration
form, then submitting fails with *"new row violates row-level security
policy for table users"*.

**Root cause (confirmed by testing 2026-08-14)**: `signUp()` with email
confirmation enabled does **not** grant a session immediately. Supabase
sends its own "confirm your email" message and withholds the session until
the link is clicked. So the client is still acting as `anon` when it tries
to insert the profile row, and the RLS policy (`id = auth.uid()`) can't
match because there's no authenticated user yet.

RLS policies added while diagnosing (migrations 043, 044) were necessary
but not sufficient — they're correct and should stay.

**Key insight — this and V1.2 are really one piece of work**:
If *we* sent the invite to the manager's address and they clicked *our*
link from that inbox, that already proves they own the email. Supabase's
second confirmation email is redundant friction.

- **Fix**: create the auth user in an Edge Function with
  `email_confirm: true` (the same flag the existing `create-user` Edge
  Function already uses) → no Supabase confirmation email → immediate
  session → profile insert succeeds.
- **Applies when** the invite went through our own email service (we can
  prove delivery to the right address).
- **The "Copy Link" fallback keeps Supabase confirmation** as a safety
  net, because a pasted link proves nothing about who clicked it.

**Approach**: one Edge Function handling the whole registration — auth
user (`email_confirm: true`) + profile row + team membership + mark invite
redeemed — using `service_role`, so RLS isn't in the way. Same pattern as
`create-user`.

**Already correct, don't break it**: the existing code handles the
"user already exists" case properly. If the email matches an existing
full user (e.g. John Smith already in the system for an External League
team), it skips account creation and just adds the team membership. One
person, one account, multiple team memberships.

---

### V1.4 Post-Registration Welcome & Team Page — NOT STARTED (needs V1.3)

Two related pieces: the success screen after registering, and the new
Team page it points people to.

#### 4a. Success screen

Currently: *"You've been added to [Team]. You can now log in."* — no
context, no next steps.

Should be (dynamic):
> Welcome [FIRST NAME] and the [TEAM NAME]!
> You have been entered into the [COMPETITION NAME].
> Please use our app [APP LINK], and log in with the details you have set
> up. On the TEAM page you will see the teams you can manage — select your
> team and add players (names and email addresses). You can make one more
> player a Manager as well (maximum of two per team). Players will get
> emails to join, just as you have, and will get access to this App.

#### 4b. New mobile "Team" page

**Layout**:
- Team selector dropdown at top (same pattern as the Coaching page —
  auto-selects when there's only one team)
- Roster below, grouped by role: **Coach → Manager → Player**
- Multi-role users appear **once** with all roles listed
  ("John Smith — Coach, Manager"), not duplicated across groups
- Inactive users greyed out and moved to the bottom

**Contact display** (see Junior Player Model below):
- U17 / Open teams → show the player's own cellphone
- U16 and below → show the linked caregiver's name + cellphone

**Permissions**:

| Who | On a Club Tournament team | On an External League team |
|-----|--------------------------|---------------------------|
| Coach / Manager / Admin | Full edit — edit name details, change role, mark inactive, "+ Add User" | **Read-only** — the Club manages these rosters |
| Player / Caregiver | Read-only roster | Read-only roster |

**Rules**:
- **No delete/remove anywhere** — only "mark inactive" (reversible, in
  case they come back)
- Max 2 managers per team, enforced
- External League rosters are club-managed (desktop admin, or Friendly
  Manager import — V1.T). Team managers don't edit them because the club
  controls Federation registrations.
- The roster view is useful to **every** role — only the actions differ

---

### V1.5 Role-Aware Mobile Navigation — NOT STARTED (needs V1.4)

**Hard constraint: maximum 6 nav buttons per role.** The six-button bottom
nav is the app's primary mobile navigation — it works well visually and
for thumb reach. A seventh breaks it. This is a design rule, not a
preference.

Once nav is role-aware, adding the Team page costs nothing for any role,
because each role's six slots are chosen for that role's actual workflow.

| Role | Proposed 6 | Notes |
|------|-----------|-------|
| Manager / Coach | **Team**, Coaching, Games, Schedule, Messaging, Resources | Team replaces Home; Home moves to a header icon |
| Player | Home, **Team** (read-only), Schedule, Messaging, Resources, *?* | Coaching & Games hidden — not relevant |
| Caregiver | Home, **Team** (read-only), Schedule, Messaging, Resources, *?* | As player — viewing, not managing |

- Coaching and Games remain **accessible** (direct URL, links from other
  pages) — they're just not in the nav for roles that don't use them
- Home still exists, reached via the header logo/icon for manager/coach
- The two `*?*` slots are Open Decision 4

---

### V1.6 Invite Landing Page — Branding & Context — NOT STARTED

Independent of the chain above; can be done any time.

When someone clicks an invite link they currently land on a bare white
"Join [Team]" form — no branding, no competition context, no sense of
where they've arrived. It needs to look legitimate (not like a phishing
page) and orient the person:

- Club logo / branding
- Competition name prominent (e.g. "Join the Summer Competitions")
- Short explanation: what this app is, what they're signing up for, what
  happens next (they'll be able to add their own players)
- Visual consistency with the rest of the app

---

### V1.7 RSVP / Availability — NOT STARTED

**Why it matters**: this is Heja's core feature. "Is my kid at training
this week?" Every parent expects it. Without it the app isn't a credible
Heja replacement.

**Scope**:
- Availability response (going / not going / maybe) on schedule events
- RSVP status visible to coaches/managers per event
- RSVP reminder push notifications (needs V1.1 proven on hardware)

**Note**: `event_rsvps` table already exists (migration 023) with
`going / not_going / maybe / no_response` and a unique constraint per
event+user. Schema is in place — this is a UI/flow build, not a data
model design.

**Open**: does this apply to Club Tournament teams too, or only club
teams? (Open Decision 5)

---

### V1.8 Feature Flags for Launch — NOT STARTED

Some already-built features should be **hidden** at launch — not removed,
just switched off, so a first-time user sees a focused app rather than
everything at once:

- Tournament management (park until there's proven demand)
- Admin reporting (admin-only, can wait)
- Session Builder / Lesson Builder advanced authoring (keep basic
  lesson delivery, hide the authoring complexity)
- Competitions page (admin-only)

Do this near launch, once we know what the trial group actually needs.

---

### V1.9 Store Distribution & Privacy Policy — NOT STARTED (needs V1.1)

**Accounts**:
- Google Play Console — **$25 one-time**, needed before distributing to
  testers or publishing
- Apple Developer Program — **$99/year**, needed to test push on a real
  iPhone and to submit at all. Worth starting the application early —
  Apple's identity verification can take a day or two on its own.

**Assets**: app icon, splash screen, screenshots per platform, store
listing copy.

#### Privacy policy — what this actually is and why it's required

You asked what this piece means, so in plain terms:

**Both Apple and Google require a publicly accessible privacy policy URL
before they will publish an app that collects personal data.** It's not
optional and it's not a formality — submissions get rejected without it.

This app collects a fair amount: names, email addresses, phone numbers,
team affiliations, attendance records, messages between users — **and data
about children**, which raises the bar. NZ's Privacy Act 2020 applies.

Both stores also make you complete a **separate questionnaire** (Apple's
"App Privacy", Google's "Data Safety") declaring what you collect and why.
Those answers need to match what the policy says, or it fails review.

**What already exists**: the lite-user registration page shows a privacy
notice with consent checkbox (name/role visible to coaches, caregiver
details visible to other caregivers, data used only for team
coordination), and consent is recorded in `users.privacy_consent_at`.
That's a genuinely good start and shows the thinking is already right —
but an in-app consent notice is **not** the same thing as a hosted
privacy policy document, and won't satisfy the stores.

**Practical options** (I'm not a lawyer — this is process advice, not
legal advice):
1. **Does the club already have a privacy policy** for its website or
   membership? If so, extending it to cover the app is usually the
   simplest and most defensible route.
2. **Use a reputable policy generator**, then have someone at the club
   (or the club's usual advisor) review it — particularly the sections on
   children's data and data retention.
3. Host it at a **stable public URL** — a page in this app would work, or
   a page on the club's website. It must stay reachable; stores re-check.

**Recommendation**: raise it with the club early rather than at
submission time. It's the kind of thing that's quick if someone already
has one and slow if nobody owns it. Worth confirming who at the club is
responsible before it becomes the thing blocking launch.

---

### V1.T Friendly Manager Import (External Leagues) — SEPARATE TRACK

Independent of the lite-user chain. Only relevant to External League
teams, not Club Tournaments.

**How the club actually operates**:
- The **Federation** owns the competition — name, dates, draws, fixtures.
  All external. We don't build any of that.
- The **Club** forms teams and rosters in **Friendly Manager** (external
  system, **no API** — CSV export only), then enters those teams into the
  Federation's own system separately.
- Today: families check the Federation's website for fixtures, and each
  team manager sets up their own Heja (or similar) for communication. Our
  app has **zero visibility** into any of it.

**Goal**: pull team + roster data out of Friendly Manager and into our
app — ideally a recurring (weekly?) sync rather than a one-off import — so
our app becomes the coaching and communication home for these teams too.

**Next step**: get a sample Friendly Manager export (or a screenshot of
the export screen). The format determines everything — which fields are
available (age group? manager email?), and crucially whether there are
**stable IDs** we can match on for re-import, or whether we have to match
on name/email. Design after seeing real data, not before.

**Likely shape**: a staging table the export is loaded into, then a
reconcile step that applies changes into the main tables. Not designed
yet.

---

### V1.B Club Branding Config — NOT STARTED (standing pattern)

**The point (stated 2026-08-14)**: club-agnostic does **not** mean
generic-looking. The WCR result should look exactly as it does now — the
difference is that WCR's name, logo and colour come from a defined source
rather than being baked into components, so another club can be delivered
by changing data, not code.

**Standing rule for all new build**: at every step, explicitly state
where each piece of club branding (name / text / colour / logo) comes
from. Don't hardcode, and don't silently invent a new mechanism — use the
shared source below. (This rule is also in
`.kiro/steering/project-standards.md` so it applies automatically in
future sessions.)

**Live hardcoded branding — the actual list (audited 2026-08-14)**:

| File | What's hardcoded |
|------|-----------------|
| `src/pages/Login.tsx` | "West Coast Rangers FC" |
| `src/layouts/MainLayout.tsx` | "Urrah" + subtitle |
| `src/layouts/DesktopLayout.tsx` | logo PNG import, "WCRF Admin", "Urrah", `#0091f3` header |
| `src/lib/invites-api.ts` | a comment only — harmless |

Smaller than it first appears: a lot of WCR references live in
`src/app/**`, which `docs/deployment/DEPLOYMENT.md` marks as dead/unused
code. Ignore those.

**Both open questions now RESOLVED (2026-08-14)**:
1. ✅ **"Urrah" is configurable** — it's a club-specific term, so it
   becomes part of the branding config, not a hardcoded product name.
2. ✅ **The six page colours are product-standard, NOT configurable** —
   Coaching green, Games orange, Resources purple, Schedule cyan,
   Messaging grey stay fixed for every club. They're semantic product
   design, not club identity. **Only the primary/header colour is club
   branding.**

**Agreed approach**:

A single-row `club_settings` table, editable without redeploy, which
naturally becomes the `clubs` table when full multi-tenancy arrives
(V2/V3 backlog) rather than being thrown away:

| Field | Example (WCR) | Used by |
|-------|--------------|---------|
| `club_name` | "West Coast Rangers FC" | Login page, email footer |
| `club_short_name` | "WCRF" | Desktop sidebar ("WCRF Admin") |
| `app_title` | "Urrah" | Mobile + desktop header |
| `app_subtitle` | *(current MainLayout subtitle)* | Mobile header |
| `logo_url` | the gannet PNG | Sidebar, headers, login |
| `primary_color` | `#0091f3` | Header background, primary buttons |
| `app_url` | `https://...` | Email links, deep links |

**Explicitly NOT in the table** (product design, same for all clubs): the
six page colours, typography, layout, iconography.

- A `useClubBranding()` hook so components read from one place.
- **Edge Functions keep using env vars** (as `send-email` already does) —
  a DB round-trip per email adds latency and needs service-role access.
  Accepting a small duplication between env vars and the table is
  simpler than the alternatives; worth noting rather than hiding.
- **Logo** needs somewhere to live — currently a bundled PNG import.
  Options: keep bundled per-deployment, or move to Supabase Storage so
  it's swappable without a rebuild. Storage is the better fit for the
  table-driven approach; not yet decided.

**Sequencing**: no need to build this before V1.2/V1.3. It matters when
V1.4 (Team page) and V1.6 (invite landing page branding) get built, since
those are new UI that would otherwise hardcode more WCR references.

---

### Reference — Junior Player User Model (DECIDED 2026-08-14)

Not a task; a decision that feeds into V1.4 and V1.T.

**Problem**: most players U16 and below have no email address or phone of
their own, but every `users` row requires an `auth.users` row (i.e. an
email and the ability to sign in).

**Agreed approach**:
- Juniors **get a real `users` row**, but **never log in themselves**. The
  caregiver's account is the active one that receives notifications,
  messages and schedule updates.
- **External League**: data arrives via Friendly Manager import; admin
  creates the row with a synthetic email (e.g.
  `player-{uuid}@app.internal`) since the child won't sign in.
- **Club Tournament**: when a manager adds a junior via the Team page, the
  form captures the **caregiver's** real details (name, email, phone) plus
  the **child's** minimum data (first/last name), producing:
  - a caregiver user (real email — they sign in)
  - a player user (synthetic email — never signs in)
  - a `player_caregivers` link between them
- The junior's `cellphone` stays empty; the Team page shows the
  caregiver's contact details beside the child's name instead.
- **Age threshold** comes from `teams.age_group`, not per-player DOB
  (there is no DOB field). U17/Open → player's own phone. U16 and below →
  caregiver's. Edge case accepted: a 17-year-old in a U15 team would show
  caregiver info.
- **No schema change needed** — `users`, `player_caregivers` and
  `caregiver_approvals` already support all of this. It's purely a
  UI/flow question.

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
| Mac session checklist (device testing) | `docs/project/MAC-SESSION-CHECKLIST.md` |
| Feature history | `CHANGELOG.md` |
| Session-by-session decisions | `CONVERSATION-HISTORY.md` |
| Deployment instructions | `docs/deployment/DEPLOYMENT-GUIDE.md` |
| Bailey lesson progress | `docs/lessons/ACADEMY-MIGRATION-PROGRESS.md` |
| Lesson creation guide | `docs/lessons/LESSON-CREATION-GUIDE.md` |
| Original handover spec | `docs/project/KIRO_HANDOVER.md` |
| Push notification Edge Function setup | `supabase/functions/send-message-push/README.md` |
| Historical rollout plan (superseded) | `docs/project/PROJECT-ROLLOUT.md` |

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
