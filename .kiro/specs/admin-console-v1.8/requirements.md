# V1.8 — Admin Console rework — Requirements

**Status:** draft, 2026-09-04. Derived from
`docs/project/ADMIN-CONSOLE-V1.8-SCOPE.md` (scope + feasibility check).
**Ships as one V1.8** (no phasing). **No new migrations** are required for the
core scope (feasibility-confirmed).

**Reads with:** the scope doc above (rationale/decisions), and
`design.md` / `tasks.md` (this folder, to follow).

---

## Guiding principles

- **P1 — Right tool, right surface.** Admins work mobile (in the field) and
  desktop (office). Setup/management = desktop; delivery/day-to-day = mobile.
- **P2 — No two homes.** Each function has one authoritative home. Where two
  entry points are wanted (e.g. Users ↔ Teams for role editing), they open the
  **same** editing surface, not divergent screens.
- **P3 — Organise by the domain hierarchy:** People (Users) → Teams →
  Competitions; plus standalone Coaching (build) and Progress Notes.
- **P4 — Desktop is admin-only** (one `ProtectedRoute allowedRoles=[ADMIN]`), so
  there is no "Main vs Admin" distinction to preserve.

---

## Requirement 1 — Desktop information architecture

**1.1** The desktop sidebar SHALL be a single, ungrouped list (remove the
"Main"/"Admin" section headers).

**1.2** The sidebar SHALL contain, in order: Landing, Users, Teams,
Competitions, Coaching, Progress Notes, Resources, Schedule, Messaging,
Announcements.

**1.3** The following SHALL be removed as standalone destinations:
- **Games** (desktop) — route, nav link, and import removed (mobile-only).
- **Session Builder** and **Lesson Builder** — nav links removed; reached via
  the Coaching hub. Their **routes remain** so the hub's links work.
- **Tournaments** — nav link + standalone route removed; the fixtures/standings
  view is reached under a selected Club Event (Requirement 4).

**1.4** Reporting SHALL remain hidden (already gated by `desktopFeatures.reporting`
→ V2.8). No change.

**1.5** No route that is kept SHALL change its path (avoid breaking bookmarks),
except where a destination is deliberately removed per 1.3.

---

## Requirement 2 — Users (People) stream

**2.1** The Users list SHALL be an **alphabetical list of all users** showing
only **team-independent** data: name, a **highest-role badge**, status
(active/inactive), last login, and lite/full.

**2.2** The highest-role badge SHALL use `users.role` (kept current by the
migration-066 trigger) with precedence **Admin > Manager > Coach > Player >
Caregiver**.

**2.3** For a **child / device-access account** (identified by a synthetic email
ending `@no-reply.invalid`), the list SHALL NOT display that synthetic email.
Instead it SHALL show a **"child / device access" indicator** and the
**caregiver's details** (name, and contact) resolved via `player_caregivers`.

**2.4** Selecting a user SHALL open a **user detail** view listing **every
team/role association** the person holds.

**2.5** From the user detail, selecting one of those team/roles SHALL open the
**same team-role editing surface** used by the Teams stream (P2) — whether
reached from Users or from Teams.

**2.6** The user detail SHALL allow editing, directly, only **team-independent
identity**: **name** and **cell phone**, and an **Appoint as admin** action.
These write to `users` (the Edit path already does).

**2.7** If the user is a **player**, the user detail SHALL show a **link to that
player's Progress Notes**.

**2.8** **Delete** SHALL be permitted only when the user is **role-free** (no
team_members rows). While the user holds any role, Delete SHALL be unavailable
with a clear "remove them from their teams first" explanation. **The actual
deletion behaviour is deferred to the retention/deletion workstream** — V1.8
does not implement a working delete beyond this guard.

**2.9** **Caregiver Reviews** SHALL be folded into the Users area (the existing
`AdminActionItems` surface rendered within/under Users), removing it as a
separate top-level tab. The mobile Caregiver Approvals tab is unchanged.

---

## Requirement 3 — Teams stream (authoritative team-setup hub)

**3.1** The desktop Teams page SHALL be the authoritative **team-setup hub**
(team details, coach, manager, pending status, invites). The **mobile Team page
remains the day-to-day roster tool**; the two SHALL NOT duplicate each other (P2).

**3.2** A team with an **outstanding manager invite** SHALL be shown as
**pending**: visually de-emphasised ("greyed"), with a **"Pending" badge** and
the **date the invite was sent** (`invite_codes.created_at`).
- **Pending rule (proposed default — DECISION D1):** a team is pending when it
  has an **unredeemed, unexpired manager invite** (`intended_role='manager'`,
  `redeemed_by IS NULL`, `expires_at >= now()`) **AND has no active manager
  member yet**.

**3.3** The Teams list SHALL show both the **Coach and the Manager** (first of
each where there are multiple). Coach = `teams.coach_id`; Manager = first
`team_members` row with `role='manager'`.

**3.4** The team-edit view SHALL provide **Assign Manager** with two mechanisms:
- **Pick existing** — a searchable, alpha-filtering dropdown of existing users;
  selecting one creates a `team_members` row `role='manager'`.
- **Invite by email** — for someone not yet in the system; reuses
  `generateInviteCode(..., 'manager')` + the existing existing-account auto-join
  path.

**3.5** Assign Manager SHALL respect the **2-managers-per-team cap** (migration
048 trigger). On hitting the cap it SHALL show a friendly message.
- **Replace flow (proposed default — DECISION D2):** when a team already has two
  managers, the admin must **remove one first** (no silent replacement; the cap
  is data-enforced).

---

## Requirement 4 — Competitions

**4.1** Competitions SHALL be presented as two sub-areas: **External Leagues**
(externally run) and **Club Events** (internally run).
- **Labels (proposed default — DECISION D3):** "External Leagues" and "Club
  Events".

**4.2** External Leagues SHALL be populatable by (a) the future Friendly Manager
**CSV import** (Requirement 7, deferred) and (b) a **manual-entry** path.

**4.3** Club Events SHALL retain the existing behaviour (list events; select one
to see its teams), with these fixes:
- The team-row action currently labelled **"Invite" SHALL become "Reinvite"**,
  offered only when a re-send is actually needed (invites are already issued).
- Each competition team SHALL provide a **click-through to that team** (opening
  the same Teams editing surface), instead of dead-ending.

**4.4** The **fixtures / standings ("Tournaments") view SHALL be reached under a
selected Club Event**, not as a standalone tab (Requirement 1.3).

---

## Requirement 5 — Coaching (build hub)

**5.1** The Coaching hub SHALL remain the entry point, linking to Lesson Builder
and Session Builder (which no longer have their own nav tabs).

**5.2** The hub's stat counts SHALL be **wired to real data and kept** — the
current **total lessons** and **total sessions** (and active coaches if
trivially available) are useful to see, so they stay but must show real figures,
not the hardcoded "87 / 28 / 18". The mock **"Recent Activity" panel SHALL be
removed** (no real source yet, and it must not ship fabricated).
- **DECISION D4 (resolved):** the richer coaching **activity dashboard** —
  lesson **deliveries with dates** and **feedback** — depends on delivery data
  captured on the **mobile Coaching page** (coaches marking lessons delivered +
  giving feedback), which doesn't meaningfully exist yet. That dashboard is
  **deferred to V2**; V1 keeps the real counts and drops the mock activity list.

**5.3** "Coaching" MAY remain the label on both surfaces — the build (desktop)
vs deliver (mobile) distinction is clear by context; no rename required.

---

## Requirement 6 — Resources

**6.1** Resources SHALL remain on desktop as the **admin content-management**
surface (upload/manage the resources members view on mobile). No functional
change beyond fitting the reworked IA.

---

## Requirement 7 — Friendly Manager CSV import (DEFERRED)

**7.1** Importing a Friendly Manager CSV (players, teams, competitions) for the
external leagues is **out of scope for V1.8** (cross-ref V1.T, blocked on a
sample export). Captured so the External Leagues area (4.2) is designed to
accommodate it later. A rudimentary user-CSV import already exists in User
Management and is the foundation.

---

## Requirement 8 — Mobile (in-field) confirmations

**8.1** During build, CONFIRM an admin can place people in roles from the
**mobile Team page** (believed already true via admin access). No new in-field
tooling is planned unless this reveals a gap.

**8.2** During build, CONFIRM the **mobile Coaching (delivery) page is
accessible to admins**, so an admin assisting a coach in the field can deliver a
plan.

---

## Non-goals / deferred

- User **deletion mechanics** → retention/deletion workstream (only the
  role-free guard is in scope here).
- Full **Friendly Manager CSV import** → future (V1.T / possibly post-V1).
- **Reporting** → V2.8 (already hidden).
- **Coaching activity dashboard** (lesson deliveries with dates + feedback,
  aggregated from the mobile Coaching page into desktop Coaching) → V2. V1 keeps
  only the real lesson/session counts.
- **Privacy + retention** → separate final V1 workstream.

---

## Decisions — all resolved 2026-09-04

- **D1 — pending rule:** unredeemed manager invite **AND** no active manager yet. ✅
- **D2 — manager-cap replace:** block at 2, remove-one-first. ✅
- **D3 — sub-labels:** "External Leagues" / "Club Events". ✅
- **D4 — Coaching hub:** keep real lesson/session counts, drop the mock Recent
  Activity; full activity dashboard → V2. ✅
- **D5 — Users "Team" column at list level:** dropped (list is team-independent;
  teams show in the user detail). ✅

**No new database migrations are required** for any of the above (feasibility
§10 of the scope doc).

