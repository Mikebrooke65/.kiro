# V1.8 — Admin Console rework — Tasks

**Reads with:** `requirements.md`, `design.md` (this folder).
Ordered so the low-risk nav simplifications land first, then the per-area work.
**No new migrations.** Verify each slice: `npm run build` + scoped `tsc`;
`npx vitest --run` (baseline 254 passing, 2 env-gated). Commit per slice or in
sensible batches per the repo owner's batch preference.

---

## Task 1 — Nav / IA simplification (low-risk, do first)

- [ ] 1.1 `DesktopLayout.tsx`: remove the "Main"/"Admin" section headers +
  the collapsed divider; render one flat sidebar list in the order: Landing,
  Users, Teams, Competitions, Coaching, Progress Notes, Resources, Schedule,
  Messaging, Announcements.
- [ ] 1.2 Remove NavLinks for **Games**, **Session Builder**, **Lesson
  Builder**, **Tournaments**, **Caregiver Reviews**.
- [ ] 1.3 `routes/index.tsx`: remove the **Games** route + import; remove the
  standalone **admin-action-items** route + import (folds into Users, Task 2);
  **keep** `lesson-builder` / `session-builder` routes. Decide tournament
  routing (prefer a `tournaments/:competitionId` route reached from a Club
  Event) — keep the component, drop the top-level nav.
- [ ] 1.4 Verify: build clean, no dead imports, no path changes to kept routes.

## Task 2 — Coaching hub cleanup (small, self-contained)

- [ ] 2.1 `DesktopCoaching.tsx`: wire **total lessons** and **total sessions**
  to real `count` queries (active coaches optional); remove the hardcoded
  87/28/18.
- [ ] 2.2 Remove the mock **"Recent Activity"** panel and the stray
  `console.log`.

## Task 3 — Users list level (Req 2.1–2.3)

- [ ] 3.1 Drop the **Team** column; columns = Name, Highest-role badge, Status,
  Last login, Lite/Full.
- [ ] 3.2 Highest-role badge from `users.role`, styled by precedence
  Admin > Manager > Coach > Player > Caregiver.
- [ ] 3.3 **Child/device rows:** detect `email LIKE '%@no-reply.invalid'`; show a
  "Child / device access" pill instead of the synthetic email, and the
  **caregiver's** name + contact (query `player_caregivers` → `users`, keyed by
  the child ids on the page).

## Task 4 — User detail (Req 2.4–2.8)

- [ ] 4.1 A user-detail view (modal, matching the page's pattern) listing
  **every team/role** (`roles-api.getUserTeamMemberships`).
- [ ] 4.2 Clicking a team/role **navigates to the Teams page with that team
  selected** (router state `{ teamId, userId? }`) — the shared editing surface.
- [ ] 4.3 Editable identity: **name**, **cell phone**, **Appoint as admin**
  (existing `users` update path). No other direct edits.
- [ ] 4.4 **Player → Progress Notes** link (reuse the existing person-notes
  surface).
- [ ] 4.5 **Delete** shown only when the user has zero `team_members` rows;
  otherwise disabled with the "remove from teams first" note. No working delete
  (deferred to retention).

## Task 5 — Caregiver Reviews fold-in (Req 2.9)

- [ ] 5.1 Render the existing `AdminActionItems` component as a section/tab
  within the Users area (reads `getPendingAdminActionItems()` as today).
- [ ] 5.2 Confirm removal of its nav link (Task 1.2) + route (Task 1.3) leaves
  nothing dangling. Mobile Caregiver Approvals tab untouched.

## Task 6 — Teams: show manager + pending (Req 3.2, 3.3)

- [ ] 6.1 Load each team's **manager** (first `team_members` role='manager' +
  user) alongside the existing coach embed; render Coach + Manager columns
  (first of each, "—" when none).
- [ ] 6.2 Load **pending manager invites** (`invite_codes`,
  `intended_role='manager'`, `redeemed_by IS NULL`, not expired) and compute
  pending per D1 (invite present AND no active manager). Render pending rows
  greyed with a **"Pending"** badge + **"invited {invite.created_at}"**.

## Task 7 — Teams: Assign Manager (Req 3.4, 3.5)

- [ ] 7.1 Add **Assign Manager** to the team-edit modal: a searchable,
  alpha-filtering user dropdown (pick existing) → insert/update `team_members`
  `role='manager'`.
- [ ] 7.2 **Invite-by-email** fallback: reuse
  `invitesApi.generateInviteCode(teamId, email, phone, 'manager')` +
  `checkInviteRecipient` / `joinExistingAccount`.
- [ ] 7.3 Catch the migration-048 `manager_cap_reached` error and show
  "max of 2 managers — remove one first." No silent replace (D2).

## Task 8 — Competitions restructure (Req 4)

- [ ] 8.1 Split into **External Leagues** / **Club Events** sections/tabs by
  `competition_type`.
- [ ] 8.2 Club Events: **"Invite" → "Reinvite"**, shown only when a (re)send is
  actually needed.
- [ ] 8.3 Club Events: **click-through** from a competition team → that team on
  the Teams page (router state `{ teamId }`).
- [ ] 8.4 Club Events: a **"Fixtures & standings"** action opening the retained
  tournament view scoped to the selected competition.

## Task 9 — Mobile in-field confirmations (Req 8)

- [ ] 9.1 Confirm an admin can place people in roles from the **mobile Team
  page** (via admin access). File a follow-up only if a gap is found.
- [ ] 9.2 Confirm the **mobile Coaching (delivery) page is accessible to
  admins**.

## Task 10 — Verification checkpoint

- [ ] 10.1 `npm run build` + `npx vitest --run` clean (254 baseline) on the head.
- [ ] 10.2 Full manual live pass as admin (see design.md "Verification").
- [ ] 10.3 Update `CHANGELOG.md` + `NEXT-SESSION-NOTES.md` (flip V1.8 to done;
  note the V2 coaching-activity dashboard).

## Deferred (not this spec)

- User deletion mechanics → retention/deletion workstream (only the role-free
  guard is here).
- Friendly Manager CSV import → future (V1.T / possibly post-V1).
- Coaching activity dashboard (deliveries + feedback) → V2.
- Reporting → V2.8 (already hidden).
