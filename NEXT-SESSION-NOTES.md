# Next Session Notes
## Current State — 18 August 2026

---

## TODO — Club logo in club_settings (V1.4 follow-up)

`club_settings` was seeded on 2026-08-18 with club name (`West Coast Rangers
FC`), primary colour (`#0091f3`), and app URL (`https://clubfootball.app`), but
**`logo_url` is NULL**. The app logo is currently a *bundled asset* (hashed
filename that changes each build), so there's no stable URL to point at.

To light up the logo on the post-registration Success Screen (and any future
`useClubBranding()` consumer):
1. Upload the WCR logo to a **public Supabase Storage bucket** (stable URL).
2. `UPDATE public.club_settings SET logo_url = '<public-url>', updated_at = now() WHERE id = true;`

Until then the Success Screen omits the logo cleanly (by design — no broken
image). This is cosmetic, not blocking.

---

## ✅ V1.4 + V1.5 — built & deployed (2026-08-18)

**V1.4 (post-registration-welcome-and-team-page) and V1.5 (role-aware nav) are
both built and live on clubfootball.app.** Frontend deployed at
`prototype@01d41fd`; migrations 046–051 (+ the 045b `caregiver_approvals`
backfill) applied; Edge Functions `redeem-invite`, `send-email`,
`create-auth-user` deployed.

### Verified working in the smoke test
- **Home "Teams" count fix (Finding A)** — player/manager sees their own team
  count, not the club-wide count. ✅
- **Team page (`/team`)** — loads the team, shows the roster, Add Junior modal
  opens. ✅
- **Manager on redemption (Finding B)** — the "Add Tournament Team" manager
  invite sets `intended_role = 'manager'` and redemption grants Manager. ✅
- **club_settings** seeded (name/colour/app_url; logo_url still null).

### V1.5 role-aware nav — DONE this session
Replaced the old crude `hasFullVersion`/`hasLiteVersion` (3-vs-6) split in
`src/layouts/MainLayout.tsx` with a **per-role tab list driven by App_Role**
(user_type is irrelevant — a lite manager sees the Manager nav). Max 6 tabs:
- Player / Caregiver: Home · Team · Schedule · Messages (4)
- Manager: Home · Team · Games · Schedule · Messages (5)
- Coach / Admin: Home · Team · Coaching · Games · Schedule · Messages (6)

Decisions locked: Coaching = Coach/Admin only; Games = Manager/Coach/Admin (its
coach-only feedback section gated inside the page); **Resources moved off the
bottom bar to a card on Home** (route opened to all roles); the **Team tab uses
the freed Resources purple `#8b5cf6`**, sitting 2nd after Home. This resolves
**Open Decision 4** (the two undecided nav slots).

### ⚠️ Gotcha that cost time: stale bundle / cache
`/team` first showed "not a member of any team" though the data was correct — it
was a **stale cached bundle**; incognito showed it fine. RLS was NOT the problem
(a `Members can read their teams` SELECT policy already exists on `teams`).
**After any deploy, hard-refresh / use incognito before assuming a bug.**

### Still open to fully close V1.4
1. **Finish the smoke test** — the one flow not yet exercised end-to-end is
   **add-a-junior consent**: submit modal → caregiver approval email → approve →
   child activates on the roster. Highest-value remaining check (hits the
   recovered `caregiver_approvals` table + RLS).
2. **Verify the new nav on device** — confirm each role sees the right tabs and
   the Resources-on-Home card works (hard-refresh first).
3. **Logo** — set `club_settings.logo_url` once the WCR logo is hosted (see the
   logo TODO above).
4. **32 optional tests** — property/unit/integration; prioritise task **10.6**
   integration tests (manager-cap trigger, RLS, add-junior writes).

### Reference IDs / accounts (test data)
- **mikey Brooo** (mobile test login, `mandcbrooke1@gmail.com`):
  user_id `72d19061-63fd-4c6d-8770-a8c8393cd693`, profile role `manager`.
  Member of **riverhead tests** (Open), team_id
  `d7b3943a-1f5a-4088-97f0-198353edf56d`, team role now `manager` (corrected via
  a manual UPDATE this session).
- **Mike Brooke** (`mikerbrooke@outlook.com`) = the admin account
  (`ad7b7dfa-…`), coach of U9 Lithium.

### Migration 036 recovery (important context)
Applying migration 051 failed with `caregiver_approvals does not exist`.
Migration 036 had only been **partially applied** in production long ago — its
`caregiver_approvals` table (036 §6) was never created. We re-created it via
`supabase/migrations/045b_caregiver_approvals_backfill.sql` (idempotent) ahead of
051, then applied 046–051. All good now, but be aware other bits of very old
migrations *could* also be partially applied — verify with `pg_policies` /
`information_schema` before assuming.

### Git state
All work pushed to `kiro prototype` and deployed (`prototype@01d41fd`, 2026-08-18):
the V1.4 feature, the migration recovery, the V1.5 nav rework, and the doc
updates. Working tree clean.

---

## Quick Reference

**App URL**: https://clubfootball.app  *(live 2026-08-14 — the old
`wcrfootball.netlify.app` still works but this is the one to use)*
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

## V1 — Where Things Stand (updated 2026-08-19)

One-line status per item. Detail is in the sections further down.

| Item | Status | What's left |
|------|--------|-------------|
| V1.0 Product domain | ✅ DONE | — |
| V1.1 Capacitor + push | 🟡 Hardware-gated | Pipeline proven to `devicesFound: 0`. Needs a real device to finish |
| V1.1a Android testing | ⬜ Not started | Android Studio on the other laptop. **No Mac needed — cheapest way to de-risk the WebView question** |
| V1.1b iOS testing | ⬜ Blocked | Needs a borrowed Mac + Xcode |
| V1.2 Email service | ✅ DONE | Only `EMAIL_REPLY_TO` (Decision 1b) |
| V1.3 Self-registration fix | ✅ DONE & browser-confirmed | 3 small follow-ups (see V1.3) |
| V1.4 Welcome + Team page | 🟠 Built, **1 blocker** | **Add-junior RLS bug = next-session Task 1**; then e2e smoke test; logo; 32 optional tests. Modal layout fixed 2026-08-19 |
| V1.5 Role-aware nav | ✅ DONE & deployed | Per-role tabs + Team tab; Decision 4 resolved |
| V1.6 Invite page branding | ⬜ Not started | Independent. Team name now renders (migration 045) |
| V1.7 RSVP / availability | ⬜ Not started | **Biggest competitive gap.** Schema exists, UI/flow to build. Decision 5 open |
| V1.8 Feature flags | ⬜ Not started | Near launch, once the trial group's needs are known |
| V1.9 Store + privacy policy | 🟡 Privacy draft in progress | Store accounts + assets need V1.1a/b. Privacy policy drafted (`docs/privacy-policy-draft.md`) — open flags to close |
| V1.R Data retention & deletion | ⬜ Scoping | Gates the privacy policy. Decisions open in `docs/data-retention-scoping.md`; best as its own spec once locked |
| V1.T Friendly Manager import | ⬜ Blocked | Waiting on a CSV export sample (Decision 6) |

**Substantive build work left for V1**: the V1.4 add-junior RLS fix (Task 1),
V1.6, V1.7, V1.8, and the V1.R retention build. Everything else is hardware,
accounts, or decisions. **V1.7 RSVP/availability is the biggest remaining feature
and top competitive gap.**

### PLAN FOR NEXT SESSION (updated 2026-08-19 — starts when the next ~2000 credits land)

**Progress since this plan was written:** V1.4 + V1.5 smoke test is part-done.
Confirmed working: per-role nav, Team page/roster, and the Add Junior **modal
layout** (fixed, commit `8d699de`). The add-a-junior flow is **blocked by an RLS
bug** — that fix is now the defined first task below.

**TASK 1 (DEFINED) — Fix add-a-junior RLS failure. START HERE.**

- **Symptom:** a manager submitting Add Junior gets *"new row violates row-level
  security policy for table player_caregivers"*. The child row is created, then
  the flow dies at the caregiver link.
- **Root cause:** `caregiversApi.addJunior` (in `src/lib/caregivers-api.ts`)
  inserts into `player_caregivers` **client-side as the manager**. The only
  INSERT-capable policies on that table are admin-only (migrations 002 and 036);
  no policy lets a manager insert. Same class of defect as the V1.3 registration
  RLS failure — a client write RLS does not actually permit.
- **Chosen approach (decided 2026-08-19): move the write server-side.** Put the
  `player_caregivers` link insert into a service-role Edge Function, consistent
  with how the child `auth.users` row is already created (`create-auth-user`) and
  with the `redeem-invite` pattern. Preferred over adding an RLS policy because at
  link time the child has no `team_members` row to key "manager of this team" on.
- **Scope / definition of done:**
  1. Move the `player_caregivers` link insert (step 4 of `addJunior`) into a
     service-role Edge Function. Simplest: extend `create-auth-user` to also
     create the link when it creates the child (it already has both ids under
     service role), or add a small dedicated endpoint.
  2. **Check step 5** — the `caregiver_approvals` insert immediately after almost
     certainly hits the same manager-can't-write wall. Verify; move it server-side
     too if so. Treat these two as one fix.
  3. Keep the invite-code / authorization model intact — the manager is
     authenticated and is acting on their own team; the function must not become a
     way to link arbitrary users. Gate on the caller being an authenticated
     manager/coach of `team_id`.
  4. Redeploy the affected Edge Function(s) (`supabase functions deploy ...`) —
     **remember Edge Functions do NOT ship with `git push`**.
  5. Re-run the add-a-junior flow end to end as a manager: submit → caregiver
     approval email arrives → approve → child activates on the roster. This also
     closes the last unverified V1.4 path (the recovered `caregiver_approvals`
     table + RLS).
- **Size:** small-to-moderate; same pattern used twice already. Keep it lean —
  do not gold-plate. Full detail in "Known issues found in V1.4 smoke test" near
  the end of this file.

**TASK 2 — Finish the V1.4/V1.5 run-through** (blocked behind Task 1 for the
add-junior part). Remaining checklist items, hard-refresh / incognito first:
- Post-registration success screen (do a fresh invite redemption).
- Contact display by age band on the Team page; gated actions per role.

**TASK 3 — Cheap modal sweep.** Align other mobile modals to the Schedule
pattern (`z-[60]`, `max-h-[85vh]`, `flex flex-col`) so they don't sit behind the
bottom nav. Known candidate: `src/components/SessionFeedbackModal.tsx`. Grep for
`max-h-[90vh]` / `z-50` overlays on mobile routes. Low credit, do when convenient.

**THEN — start V1.1a — Android device testing** — switch to the **other laptop**
(has the disk/RAM for Android Studio), run Kiro on the web there, and work
through V1.1a. Cheapest way to de-risk the WebView question and needs no Mac. See
the V1.1a section below for the detail.

**After that (not tomorrow, but the queue):**
- **V1.7 RSVP / availability** — biggest remaining V1 feature / top Heja gap.
  Resolve Decision 5 first.
- **V1.6** invite landing-page branding — now easy wiring since `club_settings` +
  `useClubBranding` exist.
- **Privacy policy** (V1.9) — user-owned, longest lead time, start the club
  conversation in parallel. Ties to Decisions 3/3b/3c.
- Loose ends: V1.4 optional tests (task 10.6 first), set `club_settings.logo_url`
  once the logo is hosted, V1.3 follow-ups.

---

## V1 — Open Decisions Needed

These block or shape work below. Listed here so they don't stay buried.

| # | Decision | Blocks | Recommendation |
|---|----------|--------|----------------|
| 1 | ~~**Email provider** — Resend, SendGrid, Postmark, or AWS SES?~~ | V1.2 | **RESOLVED 2026-08-14** — Resend, live and sending. See V1.2 |
| 1b | **`EMAIL_REPLY_TO` is not set** — replies to invite emails bounce | Nothing, but affects deliverability and looks unpolished | Decide whether invites should be repliable, and which monitored address. See V1.2 |
| 8 | **Rate limiting on `redeem-invite`** — it's an unauthenticated endpoint that can create auth users; the invite code is the only authorization | Public launch, not the trial | Fine for a small trial. Needs a decision before wider release. See V1.3 |
| 2 | **Which events trigger a push in V1?** Candidates: new message (built), new schedule event, event change/cancellation, RSVP reminder | V1.1 completion | Start with new message (done) + event change/cancellation. RSVP reminders once V1.7 exists |
| 3 | **Privacy policy** — club has none to extend (confirmed 2026-08-17), so writing from scratch | V1.9 store submission | **User-owned, in progress.** Start from the Privacy Commissioner's Priv-o-matic generator — templates and the store questionnaires are listed in V1.9 |
| 3b | **Play Console target-audience declaration** — is this an app for children, or an app about children used by adults? | V1.9, and whether Google's Families policy applies | Almost certainly adults-only audience (coaches/managers/caregivers are the users), which keeps it out of Families policy. Confirm deliberately — see V1.9 |
| 3c | **Data retention & cleanup** — how long data is kept after a role/team ends, and what triggers removal | The privacy statement can't be finished without it; also a **future build** | ⏳ Mike scoping. Detailed thinking captured in **`docs/data-retention-scoping.md`** (3 data layers, per-competition clocks, open questions). Becomes its own build/spec once decisions lock — see "V1.R" below |
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
V1.2  Email Service             ── ✅ DONE (2026-08-14)
 └─ V1.3  Fix Self-Registration ── ✅ DONE (2026-08-17), 3 follow-ups open
     └─ V1.4  Welcome + Team Page ── UNBLOCKED, next in the chain
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

---

### ▶ START HERE ON THE OTHER LAPTOP — V1.1a run sheet (self-contained)

*Written 2026-08-19 so a fresh session can execute this cold. If Mike opens Kiro
here and says "let's do 1.1a", follow this top to bottom.*

**Pre-flight (assistant, first):** confirm this environment can (a) read/write the
local project files and (b) run local shell (`node -v`, `npm -v`, `git --version`).
If it cannot run shell, stop — Mike must use Kiro desktop on this machine, because
the build needs local `npm` / `npx cap` / `git`. Also check ≥ 20 GB free disk.

**Software to install (in order):**
1. **Node.js — any current LTS (20, 22 or 24 all fine)** (includes npm) —
   https://nodejs.org . Node 24 is the newest LTS and works here; nothing in the
   project pins a version. Verify `node -v`. (If a native dep ever fails on the
   newest Node during `npm install`, drop to LTS 22 — not expected here.)
2. **Git** — https://git-scm.com . Verify `git --version`.
3. **Android Studio (latest)** — https://developer.android.com/studio . During
   setup accept the default **Android SDK**, **platform-tools**, and one recent
   **system image** (e.g. API 34/35, Google Play image so FCM works). Studio
   bundles its own JDK — no separate JDK needed for the emulator path.
   This is the ~15–20 GB item; it's why this laptop was chosen.

**Project setup:**
4. Clone: `git clone https://github.com/Mikebrooke65/WCR-Football-App.git`
5. `cd WCR-Football-App` then `npm install`.
6. Copy **`.env.development`** into the repo root — it is git-ignored, so it did
   NOT come with the clone. Source: OneDrive backup
   `C:\Users\miker\OneDrive\Project Secrets\WCR-Football.env.development`
   (rename to `.env.development`). Without it the app can't reach Supabase.

Note: the Android platform is already committed (`android/` folder) and
`android/app/google-services.json` (Firebase config) is already in the repo — do
NOT re-init Capacitor or re-add the platform.

**Build & run:**
7. `npm run build`
8. `npx cap sync android`
9. `npx cap open android` (opens Android Studio) — OR from a real Android phone
   with Developer Mode + USB debugging on, plug in and run to the device.
10. In Android Studio, start an emulator (Play-enabled image) or select the phone,
    then Run.

**Verify (the point of V1.1a — does the app work in a native WebView + does push
register?):**
11. App loads; login works; the six-button nav and pages behave in the WebView.
12. The push-permission prompt appears; accept it.
13. Confirm a row lands in **`device_tokens`** (Supabase table editor, filter by
    the logged-in user).
14. Send a real Team Message to that user; confirm the `send-message-push` path
    returns `devicesFound` > 0 (was 0 with no device) and a push actually arrives.
15. Record the outcome back in this doc and update the V1.1 status in the table.

**Known traps:** hard-refresh isn't a thing on native, but a stale JS bundle is —
if behaviour looks wrong, re-run steps 7–8 (`build` + `sync`) before assuming a
bug. If `npm install` throws `TAR_ENTRY_ERROR`, it's almost always low disk.

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

### V1.0 Buy a Product Domain — ✅ DONE (2026-08-14)

**`clubfootball.app` is bought, configured and live.** Verified from here:
HTTPS 200 on the apex, `www` 301s to it, certificate covers both.

What was done:
1. Registered at Cloudflare Registrar (~$14.20/yr). ICANN contact
   verification already satisfied from a pre-existing Cloudflare account.
2. Added `clubfootball.app` as a custom domain on the Netlify site.
3. Two Cloudflare DNS records, **both proxy-off / DNS-only**:
   apex CNAME → `apex-loadbalancer.netlify.com`, `www` CNAME →
   `wcrfootball.netlify.app`.
4. Netlify issued the Let's Encrypt certificate.

**Netlify's DNS verification flip-flopped** — reported success, then
"clubfootball.app doesn't appear to be served by Netlify", then success
again. It was wrong: at the time it failed, the apex already resolved to
exactly the same IPs as `apex-loadbalancer.netlify.com` from multiple
resolvers, and plain HTTP already returned `200` with `Server: Netlify`
serving the real app. Their check seems to trip on HTTPS not being live
yet — which is the thing the certificate fixes. **If this happens again,
just retry; don't start changing DNS records.**

#### ✅ Immediate follow-up — Supabase Auth URL configuration — DONE (2026-08-18)

**Completed and verified in the dashboard.** Both fields confirmed set:
- **Site URL** → `https://clubfootball.app` ✅
- **Redirect URLs** → `https://clubfootball.app/**` present, alongside
  `https://wcrfootball.netlify.app/**`, `https://wcrfootball.netlify.app/login`
  and `http://localhost:5173/**` ✅

The original instructions are kept below for the record.

Supabase dashboard → Authentication → URL Configuration:
1. **Site URL** → `https://clubfootball.app`
2. **Redirect URLs** → add `https://clubfootball.app/**`
   (keep `https://wcrfootball.netlify.app/**` and `http://localhost:5173/**`
   so the old domain and local dev both keep working)

Why it matters concretely:
- `AuthContext.resetPassword()` builds its redirect from
  `window.location.origin`, so from the new domain it asks Supabase for
  `https://clubfootball.app/reset-password`. Supabase **silently ignores**
  redirect targets that aren't allowlisted and falls back to the Site URL
  — so password resets would bounce people to the old domain instead of
  failing loudly, which is harder to notice.
- Supabase's own signup confirmation emails use the **Site URL**, which
  currently still points at `wcrfootball.netlify.app`. Relevant to V1.3.

Two Netlify suggestions were deliberately **declined**:
- *"Use Netlify DNS"* — impossible here. Cloudflare Registrar only
  registers domains that use Cloudflare's own nameservers.
- *"Make `www` your primary domain"* — apex gets marginally less optimal
  CDN routing, but this URL goes into invite emails, texts to parents and
  eventually app deep links. `clubfootball.app` wins on shareability.
  Revisit only if performance actually becomes a problem.

---

### V1.0 Reference — the original decision

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

**Domain and registrar DECIDED (2026-08-14): `clubfootball.app` from
Cloudflare Registrar, ~$14.20/yr.**

Domainz was considered first (familiarity — used for a previous project)
but **doesn't sell `.app`** and was more expensive, so familiarity wasn't
worth a worse outcome. Cloudflare sells at registry cost with no markup
and no first-year teaser rate, so ~$14.20 is roughly the ongoing renewal
too. DNS hosting, WHOIS privacy and registry lock are included free.

`clubfootball.app` mirrors the App ID `com.clubfootball.app`, which can't
be changed after publishing.

**Register personally, not under the club** — consistent with this being
a product domain, not a club asset.

#### DNS / hostname plan

| Hostname | Purpose | Record | Proxy |
|----------|---------|--------|-------|
| `clubfootball.app` (apex) | The app itself | CNAME → `apex-loadbalancer.netlify.com` | **DNS-only** |
| `www` | Redirects to apex (Netlify handles this) | CNAME → `wcrfootball.netlify.app` | **DNS-only** |
| `clubfootball.app/privacy` | Privacy policy (V1.9) | Static HTML page, **not** a React route — store reviewers must get it even if the app bundle fails to load | — |
| `send.clubfootball.app` | Sending domain verified in Resend | TXT (SPF, DKIM), optional DMARC | — |

Cloudflare flattens apex CNAMEs automatically (it can't be switched off at
the apex), which is why a CNAME works at the root here where most
registrars would need an A record. Netlify explicitly lists flattened
CNAMEs at Cloudflare as a supported apex setup, and
`apex-loadbalancer.netlify.com` is their current recommended target —
better than a hardcoded IP, which is what bit sites when Netlify retired
an old load balancer address in 2025.

**No code changes needed for the domain switch.** "Copy Link" builds from
`window.location.origin`, so it follows whatever domain the admin is on.
Emailed links build from the Edge Function's `APP_URL` secret. Both adapt
without a rebuild.

**App at the root**, not `app.clubfootball.app` — shortest to share, and
there's no marketing site competing for it.

**Email from a subdomain** (`noreply@send.clubfootball.app`), not the
root. If deliverability ever goes bad it damages the subdomain's
reputation, not the domain the app itself is served from. Free to do now,
painful to retrofit.

#### Four gotchas to get right

**0. Verify the ICANN registrant email immediately after purchase.** If
it isn't verified within 15 days, ICANN requires the registrar to place a
hold and Cloudflare replaces the nameservers with parking nameservers —
the domain stops resolving. Verifying restores them automatically, but
Cloudflare's forum shows people stuck in that state waiting on support
tickets. (Flagged 2026-08-14, on purchase.)

Cloudflare Registrar **requires the domain's DNS to be on Cloudflare**,
so their proxy is in the path by default. That's where the rest of the
traps are:

1. **Set the Netlify record to DNS-only (grey cloud), not proxied
   (orange).** Netlify issues its own certificate. Proxying on
   Cloudflare's default "Flexible" SSL mode produces a redirect loop. If
   the proxy is ever wanted, SSL mode must be Full (strict).
2. **`.app` is HSTS-preloaded** — browsers refuse plain HTTP outright,
   with no fallback. Fine with Netlify, but it means a misconfigured
   certificate presents as a hard failure rather than a warning. Know
   this so it isn't misdiagnosed.
3. **Deep links (V2)** need `/.well-known/assetlinks.json` (Android) and
   `/.well-known/apple-app-site-association` (iOS) served over HTTPS with
   correct content types and no redirects. Another reason to keep the
   record DNS-only.

**Then**: verify `send.clubfootball.app` in Resend (SPF/DKIM DNS
records), set `EMAIL_FROM`, `APP_URL` and optionally `EMAIL_REPLY_TO` as
Supabase secrets.

---

### V1.2 Transactional Email Service — ✅ DONE (2026-08-14)

**Live and verified end-to-end.** A real email was sent through the
deployed function and Resend returned a message ID.

- Resend account: **separate account, separate login** from the Riverhead
  Community one. Resend's free plan allows only **one domain per team**,
  that team's slot was already used by `riverheadcommunity.org.nz`, and
  creating a second team is a paid feature ($20/mo Pro). A second free
  account was the sane answer.
- Sending domain: **`send.clubfootball.app`**, verified, region Tokyo
  (`ap-northeast-1` — closest offered to NZ).
- DNS records added manually in Cloudflare (**not** Resend's "Auto
  configure", which would have granted a standing OAuth token with DNS
  write access to the same zone that points the app at Netlify):
  DKIM TXT at `resend._domainkey.send`, SPF TXT + MX at `send.send`,
  DMARC TXT at `_dmarc`. All four confirmed resolving.
  - Resend presents record names **relative to the zone root**, which is
    exactly what Cloudflare expects — enter them verbatim. Appending
    `.clubfootball.app` yourself produces
    `send.send.clubfootball.app.clubfootball.app`.
- **"Enable Receiving" deliberately left OFF** — send-only by design, no
  mailbox on the domain.
- Supabase secrets set: `RESEND_API_KEY`, `EMAIL_FROM`
  (`West Coast Rangers <noreply@send.clubfootball.app>`), `APP_URL`
  (`https://clubfootball.app`), `CLUB_NAME` (`West Coast Rangers`),
  `CLUB_COLOR` (`#0091f3`).
- `supabase functions deploy send-email` — deployed.
- Test send returned `{"success":true,"id":"..."}`.

**First real email landed in Outlook's Junk folder.** Expected, not a
misconfiguration — the domain was verified minutes earlier and has no
sending reputation, and Outlook is unusually harsh on new domains.
SPF/DKIM/DMARC were all confirmed resolving correctly beforehand.

Two things were fixed in response:
- ✅ **Added a plain-text alternative** alongside the HTML. HTML-only mail
  is a recognised spam signal. Redeployed and re-tested.
- ✅ **Fixed the subject line**, which was using HTML-escaped values — a
  team called "Mike's Team" would have arrived as "Mike&#39;s Team".

**Deliverability is now mostly a reputation problem, which needs time and
volume, not more configuration:**
1. Mark the test emails **"Not junk"** in Outlook — direct positive signal.
2. Real invites to real recipients who open them build reputation fastest.
3. After a couple of weeks of clean sending, consider tightening DMARC
   from `p=none` to `p=quarantine`. Don't do it sooner — `p=none` is the
   monitoring phase and tightening early can bounce legitimate mail.
4. Setting `EMAIL_REPLY_TO` to a real monitored address also helps, since
   `noreply@` with no reply path is a mild negative signal.

**To confirm authentication actually passed** (worth doing once): open the
message in Outlook → View message source, and look for
`Authentication-Results` showing `spf=pass`, `dkim=pass`, `dmarc=pass`.
Easier alternative: send one to a Gmail address, where "Show original"
displays all three in plain language.

**Still open — `EMAIL_REPLY_TO` is not set.** Replies to invite emails
will bounce. Decide whether invites should be repliable and, if so, which
monitored address they go to. Setting a personal address exposes it to
every recipient, which is why this wasn't just picked.

**Security note**: the first API key was pasted into chat and was
therefore revoked immediately and replaced. The replacement was created
with **Sending access only** (not Full access) and transferred via a file
outside the repo, which was deleted after use. Do it that way every time.

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

~~**Remaining**~~ — **all four steps below are now DONE** (2026-08-14):
Resend account + `RESEND_API_KEY` secret, `supabase functions deploy
send-email`, test send returning a message ID, and "Send Link" confirmed
from the app. Kept for the record; nothing here is outstanding.

**The only V1.2 item still open is `EMAIL_REPLY_TO`** (Open Decision 1b) —
replies to invite emails currently bounce.

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

### V1.3 Fix Lite User Self-Registration — ✅ DONE (2026-08-17)

**Shipped.** Self-registration from an invite link works. Built as a spec
(`.kiro/specs/lite-user-registration-fix/`) with the full record of what
was observed, decided and verified.

What landed:
- New `redeem-invite` Edge Function runs the whole redemption server-side
  as `service_role` — account, profile row, team membership, then mark the
  code redeemed **last** so a failure never burns the invite. **Deployed
  and ACTIVE; it does NOT ship with `git push`.**
- Compensating rollback undoes only what a failed attempt created, never
  pre-existing records. A retry with the same email and code then works.
- Pre-confirmation follows the email match: register with the address the
  invite was sent to → confirmed immediately, no confirmation email, log
  straight in. A different address → account and membership still created,
  but held behind Supabase's confirmation gate.
- Orphaned accounts from the old bug are **adopted** for the invited
  address; an account on a non-invited address is refused, not taken over.
- Registration errors are plain language — no policy or constraint text
  can reach the page.
- **Migration `045`** grants the anonymous role a *scoped* read on `teams`
  (only teams with a live invite). This fixed the invite heading rendering
  "undefined undefined" for anonymous visitors — a second latent defect
  found while verifying. Applied via the SQL Editor.

Verified: 101 unit/property tests, plus four live scripts against the real
project (12 exploration, 15 preservation, 39 integration, 21 rollback), all
green. `npm run build` clean.

#### V1.3 follow-ups still open — carried into V1

These were found while verifying and deliberately left out of the bugfix.
None of them block V1.4.

1. **Expired-code notification to the inviter emits nothing.**
   `validateInviteCode()` stays client-side and anonymous, so it can't read
   the inviter from `public.users` (RLS returns 0 rows silently). It is also
   still a `console.log` TODO with no in-app message wired. Fix: move the
   notification server-side, or grant a scoped read. **Small.**
2. **A non-matching-email registrant can't get past the login gate.**
   The account is correctly left unconfirmed, but GoTrue sends no
   confirmation email for an admin-created account, so nothing reaches
   them. Needs a resend/confirmation trigger. **Naturally belongs with
   V1.4's welcome email** — do it there rather than separately.
   **DECIDED 2026-08-18 (see V1.4)**: Option A + one explanatory line —
   generate the confirmation link server-side and send it via the Resend
   `send-email` function, with a sentence noting the address differs from
   the invited one. No correction workflow.
3. **Duplicate-key branch in `redeem-invite/index.ts` is too broad.**
   It treats any 23505 on the profile insert as the migration-006 trigger
   case, so a genuine email collision on a different id surfaces the wrong
   message. Rollback still holds and nothing leaks. Unreachable in normal
   use on this project (that trigger isn't live). Fix: narrow the check to
   the id conflict, or check affected rows. **Small, low urgency.**

Also outstanding, recorded not fixed: `redeem-invite` is an
unauthenticated endpoint that can create auth users — the invite code is
the authorization and **rate limiting is out of scope**. Worth a decision
before a public launch.

**✅ Browser pass DONE (2026-08-18).** Opened `/invite/SPEC67RG` on
clubfootball.app in an incognito window with the console open, for a fresh
tournament team "Open riverhead tests". Verified:
- Invite heading rendered the real team name ("Join Open riverhead tests"),
  not "undefined undefined" — migration 045's scoped anonymous read on
  `teams` working under a genuine anonymous session.
- Registration with the invited address succeeded; the success screen
  ("You've been added to Open riverhead tests") rendered.
- The `team_members` row was created — confirmed in the admin Teams view
  (member "mikey Brooo" / mandcbrooke1@gmail.com / role `player`).
- Immediate login on the invited address worked, landed on the home
  dashboard, no confirmation gate.

The matching-address path is signed off. The non-matching-address path was
not exercised (its outcome is known and scheduled — V1.4 Option A).

#### V1.3 browser-pass findings (2026-08-18) — NOT blockers, carried forward

**Finding A — player home dashboard shows "Teams: 0".** Reproduced on both
desktop and phone for the newly-registered player: the home dashboard shows
"Users: 19" but "Teams: 0", despite the player being a valid member of one
team (verified in the admin view).
- **Root cause**: `src/pages/Landing.tsx` → `fetchStats()` renders the
  "Teams" card as a **club-wide `count(*)` on the `teams` table**
  (`.from('teams').select('*', { count: 'exact', head: true })`), the same
  shape as the Users count. Under RLS, a player-role user gets 0 rows back
  from `teams` — the SELECT policy keys on the coach relationship, not
  `team_members` — so the count is 0. The Users count isn't similarly
  restricted, hence 19 vs 0. Admin sees 11 because admin RLS is
  unrestricted.
- **Two angles to resolve**:
  1. **Verify the player isn't also starved elsewhere by the same `teams`
     RLS.** `Games.tsx`/`Coaching.tsx` read teams via a `team_members`
     join (`team:teams(*)`); if the `teams` SELECT policy blocks players,
     that join may also return empty for a player. Check before assuming
     the impact is cosmetic.
  2. **Design**: a *player* arguably shouldn't see a club-wide "Teams"
     total at all — the card should show "the teams I'm in". Fold the
     display decision into **V1.4 / V1.5 role-aware home**.

**Finding B — a Manager invite assigns `role: 'player'`.** The Add
Tournament Team modal issues a "Manager invite code", but the registrant
comes through as a **Player** (confirmed on the dashboard and in the admin
Teams view). Root cause: `redeem-invite/index.ts` hardcodes `role:
'player'` for both the `users` profile row and the `team_members` row,
regardless of the invite's intent. So the manager-onboarding path produces
a player, which contradicts V1.4's welcome copy ("the teams you can
manage") and the whole Team-page permission model. **Fold into V1.4** —
that's where role/permissions are built. The invite likely needs to carry
an intended role that `redeem-invite` honours instead of hardcoding.

**Cleanup note**: this session created two throwaway tournament teams —
"Open Riverhead Frogs" (code PPZ65DXS, created on the old netlify.app
domain) and "Open riverhead tests" (code SPEC67RG). Mark inactive or remove
when convenient so they don't clutter real data.

#### Original diagnosis, kept for context

The invite flow worked right up to the registration form, then submitting
failed with *"new row violates row-level security policy for table
users"*.

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

### V1.4 Post-Registration Welcome & Team Page — NOT STARTED (V1.3 done, so UNBLOCKED)

**Fold in V1.3 follow-up 2 here**: a registrant who used an address the
invite was *not* sent to is left unconfirmed with no email from Supabase.
The welcome email this section adds is the natural place to give them a
confirmation/resend path.

#### DECIDED (2026-08-18) — how the non-matching-address case is handled

**Chosen: Option A + one explanatory line. No correction workflow.**

Why this exists at all: on the non-matching path `redeem-invite` correctly
creates the account with `email_confirm: false` and returns
`email_confirmation_required: true`, but `admin.auth.admin.createUser` does
**not** send a confirmation email the way normal `signUp` does. So the
person ends up with an account they can't log into and no way out. That's
the dead end being fixed here.

The fix:
1. On the non-matching path, generate a confirmation/magic link
   **server-side** (`admin.auth.admin.generateLink`) and send it through
   the existing Resend `send-email` Edge Function — **do not** rely on
   GoTrue's built-in mail. Resend is the one real sending path on this
   project, and routing it ourselves keeps branding in one place (the
   function's env vars) per the club-agnostic rule.
2. The email carries **one explanatory sentence**, roughly:
   > You registered for {team} using this address, which is different from
   > the one your invite was sent to. If that was intentional, confirm
   > below to finish. If it was a mistake, ignore this email and register
   > again using the address your invite was sent to.

**Explicitly NOT building** a correction/re-point flow, undo logic, or any
"change your address" UI — judged over the top for V1. The typo case is
handled by the sentence above: the wrong account simply stays unconfirmed
and inert (no cleanup needed, it never becomes usable), and the person
re-registers with the right address.

Scope: this is **two copy variants of the same email** (plain welcome for
the matching path, welcome-with-context for the non-matching path), not two
systems. The link-generation + Resend plumbing is shared with 4a's welcome
email, so it's not throwaway work.

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

**Partly improved already by V1.3**: migration 045 means the team name now
actually renders for an anonymous visitor. Before that the heading read
"undefined undefined", which would have undercut any branding added here.
The remaining work below is unchanged.

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

#### Templates and starting points (researched 2026-08-17)

**The club has no existing privacy policy to extend** (confirmed
2026-08-17), so this is being written from scratch. User-owned task,
running in parallel with the build.

*Not legal advice — this is process guidance and a list of sources.*

**Start here — the NZ Privacy Commissioner's own generator.** The Office of
the Privacy Commissioner publishes **Priv-o-matic**, a free privacy
statement generator built for small and medium organisations. Their own
description is that it takes about five minutes and covers the core
elements a statement needs under NZ law. It's the most defensible starting
point available, because it comes from the regulator rather than a
commercial template vendor.
- [OPC transparency guidance, links to Priv-o-matic](https://privacy.org.nz/responsibilities/poupou-matatapu-doing-privacy-well/transparency/)
- [Priv-o-matic source, open on GitHub](https://github.com/OPCNZ/priv-o-matic) — confirms it's a real OPC tool, not a third-party lookalike
- [OPC's own website privacy statement](https://www.privacy.org.nz/about-us/website-privacy-statement/) — usable as a worked example of the finished article

**Useful supporting reading:**
- [What a privacy statement must include](https://www.privacy.org.nz/resources-and-learning/knowledge-base/view/312/)
- [Statement vs notice vs policy](https://www.privacy.org.nz/resources-and-learning/a-z-topics/whats-the-difference-between-a-privacy-statement-notice-and-policy/) — the stores ask for a public-facing **statement**; the internal **policy** is a different document
- [digital.govt.nz guidance on privacy statements for websites](https://www.digital.govt.nz/standards-and-guidance/design-and-ux/usability/privacy-statements-for-websites)

**Then the two store questionnaires**, which are separate from the hosted
document and must agree with it:
- [Google Play Data safety section](https://support.google.com/googleplay/android-developer/answer/10787469) — a mandatory form in Play Console
- [Apple App Privacy in App Store Connect](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/) — Apple's guidance is to answer inclusively, and to cover third-party code you integrate (for us: Supabase, Firebase Cloud Messaging, Resend)

**One distinction worth getting right before filling in the store forms.**
This app holds data *about* children, but children are not the intended
*users* — coaches, managers and caregivers are. That likely puts it outside
Google's Families programme, which is aimed at apps designed for children,
while leaving the Privacy Act 2020 obligations fully intact either way. The
target-audience declaration in Play Console is what commits you, so worth
deciding deliberately rather than clicking through.
- [Google Play Families policies](https://support.google.com/googleplay/android-developer/answer/9893335) — Google requires apps targeting children to comply with applicable children's laws including COPPA and GDPR. Worth reading to confirm we're *outside* it rather than assuming.
- Also worth a look given Team Messaging exists: [Child Safety Standards policy](https://support.google.com/googleplay/android-developer/answer/14747720). It's aimed at Social, Dating and anonymous/random chat apps — closed team messaging in a known group probably isn't in scope, but confirm rather than assume, because getting a category declaration wrong is a rejection.

**Sections that need real thought for this app specifically** — a generator
won't fill these in for you:
- **Children's data** — names, team affiliation, attendance, and caregiver
  contact details for U16 and below
- **Data retention** — how long after a child leaves a team is their data
  kept, and what triggers deletion. The app currently has *no* delete, only
  "mark inactive" (a deliberate V1.4 rule), which is a retention decision
  the policy has to describe honestly
- **Who can see what** — the existing in-app consent notice already covers
  this well and is a good source of wording
- **Third parties** — Supabase (database, hosting the data), Firebase Cloud
  Messaging (push), Resend (email), Netlify/Cloudflare (hosting, DNS)
- **Overseas storage** — worth checking which region the Supabase project
  sits in, since sending personal information offshore has its own
  Privacy Act principle (IPP 12). The Resend sending domain is already in
  Tokyo (`ap-northeast-1`)

**What already exists and helps**: the lite-user registration page shows a
privacy notice with a consent checkbox (name/role visible to coaches,
caregiver details visible to other caregivers, data used only for team
coordination), and consent is recorded in `users.privacy_consent_at` —
verified still working as part of V1.3. That's the right thinking and good
raw material for the wording, but an in-app notice is **not** a hosted
privacy statement and won't satisfy either store on its own.

**Hosting**: `clubfootball.app/privacy` as a static HTML page, **not** a
React route — store reviewers must be able to reach it even if the app
bundle fails to load. Already noted in the V1.0 DNS table.

*Sources above were summarised and rephrased rather than reproduced.*

---

### V1.R Data Retention & Cleanup — SCOPING (future build, gates the privacy policy)

Not started as a build; **scoping in progress** in
`docs/data-retention-scoping.md`. This is the work behind open decision **3c**,
and the privacy policy's retention section can't be finalised until its key
decisions lock.

The shape: three data layers with different lifespans — competition-instance data
(disposable when a competition closes), player/role identity data (kept a grace
window to ease rejoining), and de-identified performance data (kept indefinitely
*if* genuinely non-personal). A scheduled job closes competitions on their clock,
dissociates roles and flags users inactive, then after a grace window deletes or
de-identifies, with advance notice first.

**Decisions that gate the build** (detail + Kiro's read in the scoping doc):
- **Soft-delete vs hard-delete (finding 2026-08-19: smaller than it looked).**
  `deleted_at` is implemented on only ONE table — `delivery_records` (coach
  lesson-delivery audit history) — not on any personal data this build touches.
  The steering "soft delete" rule is therefore largely aspirational; genuine hard
  delete for privacy cleanup conflicts with almost no real code. Direction: adopt
  best-practice privacy deletion and document the exception to the steering rule.
- **CSV, not API (correction 2026-08-19).** League rosters import via CSV from
  Friendly Manager — there is no API (roadmap decision 6 / V1.T).
- **Club close-delay + new edge cases (added 2026-08-19).** When does a Club
  competition close after its last event (2wk/4wk/?), and confirm no auto-close
  exists yet (Q1b); plus lite-users-with-no-team, orphaned pending children,
  backup-retention window, and data export on request (Q8–Q11). All in the
  scoping doc.
- **Anonymised vs pseudonymised performance data** — decides whether "kept
  indefinitely" is a legal claim. Store no FK back to a person for it to be
  genuinely non-personal.
- **Role/status model** (null the team ref + inactive, don't delete the user row).
- **Caregiver link handling** — partly answered by the existing
  `player_caregivers … ON DELETE CASCADE`; confirm the intent.
- **Club retention clock** — recommend a rolling 12-month window (one simple rule
  for the policy), not a fixed 31 Dec.
- **Notice before deletion** — warning + export window; ties to the monitored
  privacy-inbox decision.

**Best sized as its own spec once those decisions are locked.** Not small, but each
stage is independent and testable.

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

### Adult / Child User Model — CONFIRMED & EXPANDED (2026-08-18)

Foundational for the Team page (V1.4), the Friendly Manager import (V1.T)
and the **privacy policy** (V1.9). Builds on the 2026-08-14 Junior Player
model below, which stands — this section confirms it and adds the consent
architecture.

**Age split**: adults are **U17 and up**, children are **U16 and down**.
The band comes from `teams.age_group`, not a per-player DOB (we deliberately
do **not** collect birthdates — see point 4 below).

#### Model A CONFIRMED — child never logs in, caregiver is the account

A child (U16 and down) is a **data record, not a login**. They get a real
`users` row with a synthetic email, but they **never sign in and never
interact with the app directly**. The **caregiver's** account is the active
one — it receives all notifications, messages and schedule updates and acts
on the child's behalf.

Model B (children interacting directly) is **explicitly rejected for V1**:
it drags in child logins, messaging safeguarding, contactability and a far
larger privacy surface. Not a V1 conversation.

**Future direction (V2/V3, noted 2026-08-18) — a scoped child view.** If we
later want children to see e.g. their next game, we handle it *separately
and simply*, as a deliberately limited, opt-in experience gated on explicit
caregiver authorisation. The idea: with the caregiver's approval, a child
gets read-mostly access to a **narrow slice** of the app for **their team
only** — roughly the Team tab, the Calendar/Schedule tab and (team-only)
Messaging, or similar. This is **not** the same as full Model B: it's a
constrained, caregiver-authorised child mode, not a general child login.
Recorded so the V1 model doesn't foreclose it — the synthetic-email junior
record and the `player_caregivers` link are compatible with bolting a
limited child login on later. Out of scope for V1; safeguarding and the
per-tab access rules would need their own design.

Every child **must** be linked to at least one caregiver (an adult). The
link table `player_caregivers` (many-to-many, so more than one caregiver is
allowed) already supports this.

#### Two-path consent — CONFIRMED

**Who is responsible for a child's authorisation depends on how the child
entered the system, and that path is already encoded in the team type:**

| Path | Team type | Consent responsibility | Consent record |
|------|-----------|------------------------|----------------|
| **Import** | External League (club-managed, read-only in app) | **Upstream — the club.** The club's own systems managed authorisation before the data reached us. The fact the club supplies a child record is the assertion it's authorised. | Club's assertion at import time; **no** `caregiver_approvals` row |
| **Self-service** | Club Tournament (manager adds in-app) | **Ours — we capture it.** No upstream system exists. | A `caregiver_approvals` row (`status='approved'`, `responded_at`) is the provable consent record |

**Both paths still need a caregiver *link*** (child never logs in, so
notifications must reach an adult) — but only the tournament path runs the
**approval** step. Import relies on the club's upstream consent and just
stores the caregiver contact for notifications.

#### Points to carry into the V1.4 spec and the privacy policy

1. **Record provenance per child** — which path a child came in on
   (inferable from team type today; make it explicit for audit).
2. **Capture the club's assertion for imports** — record that the club
   warrants it holds consent, at import time. Protects the app; our
   position is "the club is the source of truth," not "we obtained it."
3. **Confirm the Friendly Manager export includes caregiver contact**
   (blocked on the export sample — Decision 6). Without it, imported
   children have nowhere to send notifications.
4. **No DOB collected** — age band is by `teams.age_group`. Privacy-
   friendly but approximate; accepted edge case: a 17-year-old in a U15
   team is treated as a child. State this deliberately in the policy.
5. **Minimal child data** — first/last name only. No contact, no DOB, no
   photo. Enforce in the add-a-junior form. "We hold only a child's name"
   is a strong, simple privacy claim.
6. **Active consent vs notification (tournament path)** — the child record
   should be **inactive until the caregiver approves** (double opt-in), not
   active-on-entry. Strongest position and the schema supports it.
7. **If consent never comes** — define what happens to an unapproved child
   record and after how long (ties to Decision 3c: app has no delete, only
   "mark inactive"). The policy can't be finished without this answer.
8. **Multiple / separated caregivers** — two caregivers are allowed. Do
   both have equal rights; can either remove the other? Don't need to fully
   solve for V1, but UI and policy must not assume exactly one caregiver.
9. **Dual roles** — a caregiver is often also a coach/manager. One person
   must be caregiver + coach at once; the Team page must render them
   sensibly (once, all roles listed).
10. **Age-boundary transition** — when a child moves to U17/Open, define
    the path from caregiver-proxy to their own login (manual in V1 is fine).
11. **Child consent timestamp** — adults get `privacy_consent_at` on their
    own row; a child's "authorisation to be here" is the caregiver's
    approval. Point at `caregiver_approvals.responded_at`, or copy a
    consent timestamp onto the child row, as the auditable record.

**Legal caveat**: the privacy-law framing (valid parental consent,
controller vs processor, retention obligations) needs review against the NZ
Privacy Act and the app-store children's policies before launch. The model
above is the data/flow design, not legal advice.

**Schema already supports all of this — no change needed**: `users`
(synthetic-email juniors), `player_caregivers` (the link),
`caregiver_approvals` (pending→approved→denied→escalated, with
`requested_by` / `responded_by` / `responded_at`).

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


---

## Known issues found in V1.4 smoke test (2026-08-18/19)

Two issues surfaced while verifying the add-a-junior flow. Recorded here as V1
scope items.

### 1. RLS blocks add-a-junior — BUG, blocks the flow

**Symptom:** as a **manager** (not admin), submitting Add Junior returns the red
error *"new row violates row-level security policy for table player_caregivers"*.
The child row is created server-side, but the flow then dies at the caregiver link.

**Root cause:** `caregiversApi.addJunior` step 4 does a **client-side INSERT into
`player_caregivers`** as the logged-in user. The only INSERT-capable policies on
that table are admin-only ("Admins can manage player-caregiver links", migration
002; "Allow admins to manage player_caregivers", migration 036) — every other
policy is SELECT. A manager therefore has no INSERT path. This is the same class
of defect as the V1.3 registration RLS failure: the design assumed an "ordinary
RLS-governed client write" that RLS does not actually permit.

**Fix options:**
- **(recommended) Move the `player_caregivers` link insert server-side** into a
  service-role Edge Function, consistent with how the child `auth.users` row is
  already created (`create-auth-user`) and with the V1.3 `redeem-invite` pattern.
  Preferred because at link time the child has no `team_members` row yet, so a
  client RLS policy has nothing to key "manager of this child's team" on. The
  cleanest shape is to have the child-creation step (or a small dedicated
  endpoint) also create the link, since it already has both ids under service
  role. **Likely also affects step 5** (`caregiver_approvals` insert) — check the
  same manager can insert there, or move it server-side too.
- (alternative) Add a scoped INSERT policy letting a manager/coach create the
  link, keyed off `caregiver_approvals` (team_id + `requested_by = auth.uid()`).
  More convoluted and easier to get subtly wrong; the server-side move is safer.

**Estimated size:** small-to-moderate. Same pattern we already used twice, but it
is real build work (Edge Function change + redeploy + a verification pass), not a
one-line patch. **Deferred pending a credit decision** (see session note below).

### 2. Modal layout — Add Junior FIXED, others may share the bug

**Fixed (`8d699de`):** the Add Junior modal's buttons were hidden behind the
bottom nav (equal `z-50`, nav painted on top) and the form couldn't scroll to
them. Now uses the proven mobile modal pattern from `src/pages/Schedule.tsx`:
`z-[60]`, `max-h-[85vh]`, `flex flex-col` with a pinned header, a
`flex-1 overflow-y-auto` body, and a pinned footer. Confirmed working.

**Still to check — other mobile modals may have the same overlap.** Several still
use the older centered `p-6 max-h-[90vh] overflow-y-auto` style at `z-50`, which
can sit behind the bottom nav on a tall form. Known candidates:
`src/components/SessionFeedbackModal.tsx`, and any mobile-route modal not already
on the Schedule pattern. **Do a cheap sweep** — grep for `max-h-[90vh]` /
`z-50` modal overlays on mobile routes and align them to the Schedule pattern —
rather than fixing reactively one bug report at a time.
