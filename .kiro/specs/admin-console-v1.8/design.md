# V1.8 — Admin Console rework — Design

**Reads with:** `requirements.md` (this folder), `docs/project/ADMIN-CONSOLE-V1.8-SCOPE.md`.
**No new database migrations** — everything below reuses existing tables, RLS,
and triggers (feasibility §10 of the scope doc).

---

## Architectural principles applied

- **One editing home per concern (P2).** Team-role management lives on the
  **Teams page**. The Users stream *navigates to it* rather than reimplementing
  it — that's the "two doors, one room": both routes land on the same Teams
  member-editing surface.
- **Reuse existing APIs.** `teams-api`, `roles-api`, `invites-api`,
  `caregivers-api`, `competitions-api` already cover most reads/writes; add small
  query methods, don't restructure.
- **Nav-only vs behavioural changes are separated** so the low-risk nav
  simplifications can land and be verified independently.

---

## 1. Information architecture (Req 1)

**`src/layouts/DesktopLayout.tsx`** — the sidebar:
- Remove the "Main"/"Admin" section headers and the collapsed-divider between
  them; render one flat list.
- Order: Landing, Users, Teams, Competitions, Coaching, Progress Notes,
  Resources, Schedule, Messaging, Announcements.
- Remove NavLinks: **Games**, **Session Builder**, **Lesson Builder**,
  **Tournaments**, **Caregiver Reviews** (the last folds into Users).

**`src/routes/index.tsx`:**
- Remove the **Games** route + its import.
- **Keep** the `lesson-builder` and `session-builder` routes (reached from the
  Coaching hub) — only their nav links go.
- **Tournaments routing:** keep the `DesktopTournamentPage` component, but it's
  reached **from a Club Event** (Competitions), not a top-level nav item. Design
  choice to settle in build: either (a) keep a `tournaments/:competitionId`
  route linked from the club event, or (b) nest it under
  `competitions/:id`. Prefer (a) — least churn, the page already takes a
  competition context.
- Remove the **`admin-action-items`** standalone route (folds into Users, §2).

Risk: none of the *kept* routes change path (Req 1.5). Games/admin-action-items
removal verified to have no other referencers (scope §10).

## 2. Users (People) stream (Req 2)

**`src/pages/desktop/UserManagement.tsx`** becomes the two-level surface.

**List level:**
- Columns: Name, Highest-role badge, Status, Last login, Lite/Full. **Drop the
  Team column** (D5). Alpha order (already `.order('last_name')`).
- Highest-role badge = `users.role` (trigger-maintained), styled by precedence
  Admin > Manager > Coach > Player > Caregiver.
- **Child/device rows:** detect `email` ending `@no-reply.invalid`. Render a
  "Child / device access" pill instead of the synthetic email, and show the
  **caregiver** (name + contact) resolved from `player_caregivers` →
  caregiver `users`. (One extra query keyed by the child ids on the page.)

**Detail level** (modal or `users/:id` sub-view — prefer a modal, matching the
page's existing modal pattern):
- Lists **every team/role** for the user (`roles-api.getUserTeamMemberships`
  already returns `team_members` + team). Each row shows team + role.
- **Clicking a team/role navigates to the Teams page with that team selected**
  and (ideally) the member focused — this is the shared editing surface (P2).
  Carry `teamId` (+ optional `userId`) via router state.
- **Editable identity here:** name + cell phone (existing `users` update path),
  and **Appoint as admin** (sets `users.role='admin'`). These are the only
  direct edits.
- **Player → Progress Notes link:** if the user is a player, link to their
  Progress Notes (reuse the `GantPersonDetailModal`/notes surface, or a link to
  the existing person-notes view).
- **Delete:** shown only when the user has **zero** `team_members` rows;
  otherwise disabled with the "remove from teams first" note. No working delete
  is built (deferred to retention).

**Caregiver Reviews fold-in (Req 2.9):** render the existing `AdminActionItems`
component as a **section/tab within the Users area** (e.g. a "Reviews" tab on the
Users page, or a panel), reading `caregiversApi.getPendingAdminActionItems()` as
today. Remove its nav link + standalone route.

## 3. Teams stream — setup hub (Req 3)

**`src/pages/desktop/TeamsManagement.tsx`:**

**Reads (add small queries; no migration):**
- **Managers:** for each team, first `team_members` row `role='manager'` (join
  users for the name). Fetch alongside the existing `coach` embed — either a
  second query keyed by team ids, or extend the list load.
- **Pending status (D1):** a team is *pending* when it has an **unredeemed,
  unexpired manager invite** (`invite_codes` where `team_id=…`,
  `intended_role='manager'`, `redeemed_by IS NULL`, `expires_at >= now()`)
  **AND no active manager member**. Fetch pending manager invites in one query
  (`invite_codes` is authenticated-readable) and cross-reference the manager
  presence from the managers query. Keep the invite `created_at` for the date.

**Render:**
- Show **Coach and Manager** columns (first of each; "—" when none).
- A **pending team** row is de-emphasised (greyed) with a **"Pending" badge** and
  **"invited {date}"** (invite `created_at`).

**Team-edit modal — Assign Manager (Req 3.4/3.5):**
- **Pick existing:** a searchable, alpha-filtering user dropdown (same UX as the
  messaging compose recipient search). On select → insert `team_members`
  `{team_id, user_id, role:'manager'}` (via `roles-api.addTeamMember` or an
  `updateTeamMemberRole` if they're already a member). The migration-066 trigger
  updates their global role.
- **Invite by email:** reuse `invitesApi.generateInviteCode(teamId, email,
  phone, 'manager')` + `checkInviteRecipient`/`joinExistingAccount` — the exact
  path `CompetitionsPage.addTournamentTeam` uses.
- **Manager cap (D2):** the migration-048 trigger raises `manager_cap_reached`.
  Catch it and show "This team already has the maximum of 2 managers — remove
  one first." No silent replace.

**Shared editing surface (P2):** the team-member management on this page is the
single home; the Users detail (§2) links into it. If deep-linking to a specific
member is more than trivial, V1 may settle for "open the team with that team
selected" and leave member focus as polish.

## 4. Competitions (Req 4)

**`src/pages/desktop/CompetitionsPage.tsx`:**
- Present **External Leagues** and **Club Events** as two sections/tabs
  (`competition_type` is `external_league` | `club_tournament`).
- **External Leagues:** keep manual create/edit; the CSV import is deferred (Req
  7) — leave room for it.
- **Club Events:** existing behaviour, with:
  - Team-row **"Invite" → "Reinvite"** — show only when there's actually an
    outstanding/absent invite to (re)send; otherwise no invite action.
  - **Click-through** from a competition team to that team on the Teams page
    (router state `{ teamId }`, same pattern as §2).
  - A **"Fixtures & standings"** action opening the tournament view for the
    selected club event (the retained `DesktopTournamentPage`, scoped by
    competition id).

## 5. Coaching hub (Req 5)

**`src/pages/desktop/DesktopCoaching.tsx`:**
- Keep the two builder cards + quick actions.
- **Wire the counts to real data:** total lessons (`count` on the lessons
  table), total sessions (sessions table). Active coaches optional (count
  `users` role `coach`/`is_coach`) if trivial.
- **Remove the "Recent Activity" panel** entirely (mock).
- Remove the stray `console.log('DesktopCoaching rendering')`.

## 6. Resources (Req 6)

No change beyond IA placement; it stays as the admin content-management page.

---

## Data & queries — summary (NO migrations)

| Need | Source | Notes |
|------|--------|-------|
| Highest-role badge | `users.role` | trigger-maintained (mig 066) |
| Child detection | `users.email LIKE '%@no-reply.invalid'` | from create-auth-user |
| Caregiver of a child | `player_caregivers` → `users` | one query keyed by child ids |
| Team managers | `team_members` role='manager' + users | first per team |
| Pending manager invite | `invite_codes` (auth-readable) | `intended_role='manager'`, `redeemed_by IS NULL`, not expired; `created_at` = sent date |
| Assign manager (existing) | insert/update `team_members` | cap trigger (mig 048) may raise `manager_cap_reached` |
| Assign manager (new) | `invitesApi.generateInviteCode(...,'manager')` | existing path |
| User's teams/roles | `roles-api.getUserTeamMemberships` | exists |
| Caregiver reviews | `caregiversApi.getPendingAdminActionItems` | exists |
| Lesson/session counts | lessons / sessions tables | `count` |

---

## Verification

- `npm run build` clean; scoped `tsc` on each changed `.tsx`.
- `npx vitest --run` — expect **254 passing** (2 env-gated redeem-invite tests
  per the standing baseline).
- Manual live pass as admin on desktop: Users list (child rows show caregiver,
  highest-role badge, no Team column); user detail (roles, edit name/phone,
  appoint admin, player→Progress Notes link, delete gated); Teams (pending
  badge+date, manager shown, Assign Manager both ways, cap message);
  Competitions (leagues/club split, Reinvite, click-through, fixtures view);
  Coaching (real counts, no mock activity); Games gone; Caregiver Reviews under
  Users.
- Confirm the mobile in-field checks (Req 8) separately.
