# V1.8 — Admin Console review & rework (SCOPE)

**Status:** scope agreed in a working session with the repo owner, 2026-09-04.
**Not yet built.** Next step is a "check our work" pass against the codebase
(feasibility/grounding) before this becomes a spec.

> This began as "V1.8 = hide Reporting + a few admin-tab fixes" and grew into a
> proper **admin-console review**. Reporting is already hidden (done → V2.8).
> **Phasing (V1-launch-necessary vs V2) is deliberately still open** — to be
> decided now that the full scope is understood (see §8).

---

## 1. Framing — the right tools, on the right surface

Admins work on **two surfaces**:
- **Mobile — "in the field":** assisting a team at a game/session; day-to-day,
  in-the-moment.
- **Desktop — "at the office/home":** setup and management of the club.

**Goal of V1.8:** confirm an admin has the correct tools to manage the app's
functions, and that each function lives on the surface where the admin will
actually be when they need it.

**Surface principle:**
- **Mobile = delivery + day-to-day:** roster actions (add player/caregiver,
  remove, make coach), *deliver* coaching plans, game scores/feedback, Progress
  Notes capture, caregiver approvals, messaging, schedule.
- **Desktop = setup + management:** create/edit teams, assign roles (coach +
  manager), manage users, competitions setup, *build* coaching plans, edit
  Progress Notes guardrails, manage resources, announcements.

**No two homes for anything** — where a function could live on both surfaces, it
has ONE authoritative home; the other surface either doesn't duplicate it or
opens the *same* editing surface (see the Users/Teams "two doors, one room"
note in §4.A/§4.B).

---

## 2. Core mental model / hierarchy

**People (Users) → Teams → Football events / Competitions**

- **Users (People):** the base entity. A person can hold **multiple roles**
  across **multiple teams**.
- **Teams:** where users are placed.
- **Competitions / football events:** where teams are placed (a team can be in
  many). Split by who runs them:
  - **External Leagues** — externally run. Games flow through the normal
    Schedule; no operate screen.
  - **Club Events** — internally run. These hold the fixtures / standings /
    draws (the function currently called "Tournaments").

**Standalone areas** (not on the spine): **Coaching** (building lesson + session
plans) and **Progress Notes** (AI feedback assistant + guardrails).

---

## 3. Desktop console information architecture (reworked)

**Drop the "Main / Admin" section split entirely** — desktop is admin-only, so
everything in the sidebar is simply "the pages an admin uses from a desktop."
One coherent list, organised by the hierarchy:

- **Landing** — console home
- **Users** — People stream (Caregiver Reviews folded in here)
- **Teams**
- **Competitions** — → External Leagues / Club Events (club events hold
  fixtures/standings; **no separate Tournaments tab**)
- **Coaching** — the build hub (Lesson Builder + Session Builder live inside it)
- **Progress Notes** — guardrails + usage
- **Resources** — admin uploads the resources members view on mobile
- **Schedule**
- **Messaging**
- **Announcements**

**Removed / folded / hidden:**
- **Games** — removed from desktop (mobile-only; an admin uses Games from their
  phone).
- **Session Builder / Lesson Builder** — removed as standalone tabs; reached via
  the Coaching hub (which already links to both). Routes stay.
- **Tournaments** — removed as a standalone tab; folds under a selected Club
  Event.
- **Reporting** — hidden for V1 (→ V2.8), already done.

**Naming:** "Coaching" stays the label on **both** surfaces — the delineation is
clear by context (mobile Coaching = *deliver*; desktop Coaching = *build*). No
rename needed.

---

## 4. Detailed scope by area

### A. Users (People) stream

**Today:** a flat list — Name, Email, Role (single), Team (blank), Status, Last
login, Actions (Edit/Promote/Delete). The Edit modal already writes
`first_name`, `last_name`, `cellphone`, `email`, `role`, `active` to `users`.

**Fixes:**
- **Child token-access accounts show their token in the "Email" column** —
  meaningless. Instead show the child's **name + a "child / device access"
  badge, and the caregiver's details** (the child list must surface caregiver
  contact, not just a badge).
- **Role column shows a single role** — replace with a **highest-role** summary.
  Highest role = the already-computed `users.role` (a trigger derives
  Manager > Coach > Player from memberships; `admin` is manual). **Precedence:
  Admin > Manager > Coach > Player > Caregiver.**
- **Team column is blank** — either populate (e.g. team count) or drop it at the
  list level (the list is team-independent by design).

**Target design — two levels:**
- **List (top level):** alphabetical, all users, **team-independent generic data
  only** — name, highest-role badge, status, last login, lite/full.
- **User detail (on select):** lists **every team/role association**. Selecting a
  role **navigates to the Teams page with that team selected** — team-involvement
  editing is owned by the Teams page.
  - **Two doors, one room:** a user's team/role can be managed from *both* the
    Users detail and the Teams page, **as long as both open the same editing
    surface** (one implementation, reached two ways) — not two divergent screens.
- **Editable directly on the People stream** (team-independent identity only):
  **name**, **cell phone**, **appoint as admin**.
- **Delete:** a user may only be deleted when **role-free** (no team roles).
  **Deletion itself is deferred to the retention/deletion workstream** — V1.8
  does *not* build a working delete (show it disabled with the "remove from
  teams first" rationale). The "role-free only" rule is the agreed constraint
  for when it's built.
- **Player → link to their Progress Notes** on the detail page.
- **Caregiver Reviews** (today a separate tab + `admin-action-items` route)
  **folds under Users.**

### B. Teams stream — the authoritative team-setup hub

Desktop Teams = the setup hub (team details + coach + manager + pending +
invites). The **mobile Team page stays the day-to-day roster tool** (add
player/caregiver, remove, make coach). No overlap.

**Fixes:**
- **Pending teams shown as pending:** a team whose invited manager hasn't
  accepted yet — signal: an **unredeemed, unexpired manager invite**
  (`invite_codes.redeemed_by IS NULL`, not expired, `intended_role = 'manager'`)
  — shown **greyed out with a "Pending" stamp and the date the invite was sent**
  (invite `created_at`). Reuse the exact signal the Competitions page already
  uses for its "Pending" state.
- **Show the Manager, not just the Coach.** Coach is `teams.coach_id` (single);
  managers live in `team_members` (role `manager`). Show both; if multiple,
  show the **first of each**.
- **Assign Manager** in the team-edit view: **both** mechanisms — a **searchable,
  alpha-filtering dropdown of existing users** (primary) + **invite-by-email**
  for someone not yet in the system (fallback; mirrors the Competitions
  add-manager flow).

### C. Competitions

Top-level nav → two sub-areas:
- **External Leagues** — populated by the **Friendly Manager CSV import** (see
  §4.F) plus a **manual-entry** path (~10–20 leagues, so manual is realistic).
- **Club Events** — already operating: lists events; selecting one opens a modal
  of the teams added to it.

**Fixes on Club Events:**
- Team-row action **'Invite' → 'Reinvite'** — invites have all been issued;
  offer Reinvite only when a re-send is actually needed.
- **Click-through from a competition's team → that team** on the Teams page
  (instead of dead-ending — currently you must leave Competitions, go to Teams,
  find the team). Same "click → jump to Teams with it selected" pattern as the
  People stream.
- The **fixtures/standings ("Tournaments") view nests here**, under a selected
  Club Event — not a separate tab.

### D. Coaching (build hub)

- Keep the **Coaching Hub** as the entry point; **Lesson Builder + Session
  Builder live inside it** (standalone tabs removed).
- **Replace the hub's fake data** — the hardcoded "87 sessions / 28 lessons / 18
  coaches" stats and mock "Recent Activity" must be **wired to real data** (real
  counts / recent activity), or the panels dropped if the data isn't readily
  available. (They're currently misleading and not club-agnostic.)

### E. Progress Notes

Standalone admin area (guardrails + usage CSV) — already built (V1 Task 8). No
change beyond fitting into the reworked IA.

### F. Resources

Reclassified as an **admin content-management tool** — this is where admins
**upload/manage** the resources members view on the mobile Resources page.
Stays on desktop.

### G. CSV import (Friendly Manager) — future

Import a Friendly Manager CSV (players, teams, competitions) for the **external
leagues** — feeds §4.C's External Leagues. Touches People + Teams +
Competitions. **Foundation exists:** User Management already has a rudimentary
"Import Users from CSV." Cross-ref existing **V1.T** (blocked on a sample
export). Likely its own build, **possibly post-V1**.

---

## 5. In-field (mobile) items to confirm during build

- **Admin placing people in roles in the field** — believed already possible via
  the mobile Team page under admin access. **Confirm** admin access exposes
  those role actions on mobile.
- **Admin delivering coaching in the field** — ensure the **mobile Coaching
  (delivery) page is accessible to admins.**

---

## 6. Confirmed decisions (quick reference)

- Desktop IA: single list, no Main/Admin split; grouped by the hierarchy.
- Remove: Games (desktop), standalone Session/Lesson Builder tabs, standalone
  Tournaments tab. Hidden: Reporting (V2.8).
- Users: two-level; child rows show caregiver details + child badge (not token);
  highest-role summary (Admin>Manager>Coach>Player>Caregiver); editable name +
  phone + appoint-admin; delete only when role-free (and deferred to retention).
- Teams: authoritative setup hub; pending stamp + invite date; show coach +
  manager (first of each); Assign Manager = searchable existing-user dropdown +
  invite-by-email.
- Competitions: External Leagues / Club Events; Invite→Reinvite; click-through
  to team; Tournaments nested under club event.
- Coaching: hub with builders inside; fake stats → real data.
- "Two doors, one room" for team/role editing (Users + Teams open the same
  surface).
- Naming: "Coaching" unchanged on both surfaces.

---

## 7. Out of scope / deferred

- **User deletion mechanics** → the retention/deletion workstream (only the
  "role-free to delete" rule is agreed here).
- **Full Friendly Manager CSV import** → future (V1.T / possibly post-V1).
- **Reporting** → V2.8 (already hidden).
- **Privacy + retention** → separate final V1 workstream.

---

## 8. Phasing — DECIDED: no phasing, all one V1.8 (2026-09-04)

Decision: **do it all as a single V1.8**, not split. The feasibility check (§10)
confirmed the whole scope is low-risk and needs no migrations, so there's no
reason to phase — it goes in as one coherent admin-console rework. The
"must/easy vs rework" grouping below is retained only as a build-ordering guide
within the single spec, not as a ship boundary.

The concrete, low-risk items vs. the larger rework (build-order guide only):

**Likely "must / easy" (candidate V1.8a):**
- Teams: pending stamp + invite date; show manager; Assign Manager.
- Competitions: Invite→Reinvite; the fake Coaching stats.
- Remove Games tab; collapse Session/Lesson Builder into Coaching; drop
  Main/Admin split. (Nav simplifications — low risk.)
- Users list bug fixes: child-token display + caregiver details; blank Team
  column; highest-role badge.

**Likely "rework" (candidate V1.8b / early V2):**
- Users two-level redesign + user-detail role management + click-through.
- Teams ↔ Users "two doors, one room" shared editing surface.
- Competitions External Leagues / Club Events restructure + Tournaments nesting.
- Caregiver Reviews fold-in.

Decision on the split to be taken after the "check our work" feasibility pass.

---

## 9. Open questions still to resolve

1. Phasing split (§8) — how much is V1-launch vs V2.
2. Sub-labels "External Leagues" / "Club Events" — confirm wording.
3. "Team" column at the Users list level — populate (count) or drop.
4. Coaching Hub stats — wire to real data, or drop the panels if data isn't
   cheap to compute.

---

## 10. Feasibility check — verified against the codebase (2026-09-04)

**Headline: the V1.8 scope as drawn needs NO new database migrations.** It's all
UI + queries reusing existing tables, RLS, and triggers. That's a strong
low-risk signal for going live. Details:

### ✓ Confirmed feasible as-is

- **Pending-team signal.** `invite_codes` is readable by any authenticated user
  (RLS `"Allow authenticated users to read invite_codes" USING (true)`), and has
  everything needed: `team_id`, `redeemed_by` (null = pending), `expires_at`,
  `intended_role` ('manager'), `created_at` (the "sent" date), plus a `team_id`
  index. A per-team unredeemed-manager-invite lookup is a small new query — no
  migration. (`getPendingInvites()` already exists as a pattern.)
- **Show the Manager.** Managers are `team_members` rows with `role = 'manager'`
  (migration 048); coach is `teams.coach_id`. A simple join/query — no schema
  change.
- **Assign Manager (existing user).** Insert/update a `team_members` row
  `role='manager'`. Admin can write team_members; the role-sync trigger
  (migration 066) then updates the person's global `users.role`. Works today.
- **Assign Manager (invite-by-email).** Reuse `invitesApi.generateInviteCode(
  teamId, email, phone, 'manager')` + `checkInviteRecipient` / `joinExistingAccount`
  — exactly what `CompetitionsPage.addTournamentTeam` already does.
- **Highest-role badge = `users.role`.** Migration 066's trigger keeps it current
  (Manager > Coach > Player; `caregiver` if only caregiver-linked; `admin` is
  manual/top). Trustworthy to display directly. (Caveat: the Mike-role-flip
  anomaly from Friday is a *watch item*, but the mechanism itself is sound.)
- **Child / device-access identification — SOLVED.** `create-auth-user` gives a
  child (`can_sign_in: false`) a **synthetic email `child.<uuid>@no-reply.invalid`**.
  So a child row is reliably identifiable by **email ending in `@no-reply.invalid`**.
  That's the signal to (a) suppress the meaningless synthetic address in the list
  and (b) show a "child / device access" badge + the **caregiver's details**
  (via `player_caregivers` → caregiver `users`). No schema change.
- **Games removal & Caregiver-Reviews fold-in.** `DesktopGames` is referenced
  ONLY in the router (import + route) — safe to drop (route + nav + import).
  `AdminActionItems` is referenced only by the router + its nav link; folding it
  under Users means rendering that same component inside/near `UserManagement`
  (it reads `caregiversApi.getPendingAdminActionItems()` generically). Low risk.
  (Note: the *mobile* Caregiver Approvals tab is separate and untouched.)
- **Coaching hub real counts.** Total sessions / lessons / active coaches are
  straightforward count queries over existing tables.

### ⚠ Real constraints / decisions this surfaced

1. **Manager cap = 2 per team** (migration 048's `enforce_manager_cap` BEFORE
   trigger raises `manager_cap_reached`). Assign Manager MUST catch that error
   and show a friendly message. Also decide: to *replace* a manager when a team
   already has two, does the admin remove one first? (No cap bypass — the
   trigger is data-layer.)
2. **Exact "pending team" rule.** Simplest = "has an unredeemed, unexpired
   manager invite." Safer = that AND "has no active manager member yet" (so a
   team that already got a manager but has a stale old invite doesn't show as
   pending). Pick one when we spec it.
3. **Coaching hub "Recent Activity" panel** has no obvious real data source
   (the counts do). Either wire it to something real (e.g. latest lesson/session
   `created_at`) or drop that panel — don't keep the fake list.
4. **Child identification edge:** lite users have *real* emails; only children
   carry the `@no-reply.invalid` synthetic. The rule keys off that domain, so a
   lite adult is never mistaken for a child.

### Migrations required

**None for the core scope.** The only place a migration might enter is if the
"pending team" rule or a future need calls for a stored flag — but as scoped,
it's derivable from `invite_codes`, so not needed. (Deletion + the Friendly
Manager import are deferred anyway.)
