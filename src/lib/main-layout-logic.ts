// Pure logic for the bottom-nav tab set and the Caregiver Approvals tab.
//
// Spec: `.kiro/specs/add-player-and-dob-age-model/` (task 12.1);
//       `.kiro/specs/streamlined-invites-and-child-access/` (task 8) added
//       `tabsForRole`.
//
// Kept free of React so the visibility/badge decision can be unit- and
// property-tested without rendering `MainLayout.tsx` — this codebase has no
// component-rendering test harness (see the 10.6/11.3 notes in tasks.md).

import { UserRole } from '../types/database';

/** Whether the Approvals tab shows, and what its badge reads, for one user. */
export interface ApprovalsTabState {
  visible: boolean;
  badge: number;
}

/**
 * Which bottom-nav tab a `TabSpec` renders as — `MainLayout.tsx` maps this
 * to its own icon, kept out of this file since JSX/icons aren't part of the
 * pure tab-set decision this module tests.
 */
export type TabKey = 'home' | 'team' | 'coaching' | 'games' | 'schedule' | 'messages' | 'approvals';

/** One bottom-nav tab, everything `MainLayout.tsx` needs except the icon. */
export interface TabSpec {
  key: TabKey;
  to: string;
  label: string;
  color: string;
  end?: boolean;
  /** Shown as a small numeric badge on the tab (Requirement 8.3, 8.4). */
  badge?: number;
}

/**
 * Build the bottom-nav tab set for a given App_Role (`users.role`),
 * independent of `user_type` (a lite manager sees the same tabs as a full
 * manager). Coaching is Coach/Admin only (see `hasCoachAuthorityOnAnyTeam`
 * below for the one addition to that); Games is Manager/Coach/Admin (its
 * coach-only sections are gated inside the page). Every other role — Player,
 * Caregiver, and a **child's account** (`streamlined-invites-and-child-
 * access` Requirement 7.2.1-7.2.4) — gets exactly Home, Team, Schedule,
 * Messages, plus Approvals whenever `approvalsTab.visible`.
 *
 * A child's account uses `role: 'player'` — there is no separate child
 * role — so it already falls through to that same four-tab set with zero
 * special-casing here. This function (extracted from `MainLayout.tsx` so it
 * can be tested without a component-rendering harness) is what Task 8
 * confirms rather than changes: see `main-layout-logic.test.ts` for the
 * regression test that locks this in for a `player` role.
 *
 * `hasCoachAuthorityOnAnyTeam` (V1.R Part 1 follow-up, found live-testing
 * 2026-09-02): `role` is a single global value, and migration 066's
 * role-sync trigger gives Manager precedence over Coach when computing it —
 * so a person who is `role: 'manager'` on a team AND has `is_coach = true`
 * there (the exact "Make Coach on the first Manager" scenario this whole
 * feature was built for) keeps a global role of `'manager'` and would
 * otherwise never see the Coaching tab, despite genuinely holding Coach
 * authority. Confirmed live: George Pig (Manager, then Make Coach) got
 * Games (already had it as Manager) but not Coaching, while Hewie Duck
 * (plain Player, then Make Coach) correctly flipped to a global role of
 * `'coach'` and got both — because Player has no precedence to compete
 * with. This parameter closes that gap without touching the single-value
 * global role model or the trigger's precedence: the caller
 * (`MainLayout.tsx`) derives it straight from the already-fetched
 * `user.teamMemberships` (`some(tm => tm.role === 'coach' || tm.is_coach)`),
 * no extra query needed. Defaults to `false` so every existing call site
 * (and this file's own tests) is unaffected unless it opts in.
 */
export function tabsForRole(
  role: UserRole | undefined,
  approvalsTab: ApprovalsTabState,
  hasCoachAuthorityOnAnyTeam = false
): TabSpec[] {
  const showCoaching = role === UserRole.ADMIN || role === UserRole.COACH || hasCoachAuthorityOnAnyTeam;
  const showGames =
    role === UserRole.ADMIN || role === UserRole.COACH || role === UserRole.MANAGER;

  return [
    { key: 'home', to: '/', label: 'Home', color: '#0091f3', end: true },
    // streamlined-invites-and-child-access, Decision 1 — this used to be a
    // separate "Approvals" tab pointing at the same `/team` destination as
    // this one (a leftover from retiring the old dedicated Approvals page:
    // its `to` was repointed here rather than removing the tab outright).
    // With two tabs sharing one destination, "Approvals" read as a broken
    // or confusing extra button rather than a helpful shortcut — flagged
    // live-testing 2026-08-28. The badge now lives directly on this Team
    // tab instead: still visible exactly when there's something pending
    // (via `resolveApprovalsTab`), no separate tab needed.
    {
      key: 'team',
      to: '/team',
      label: 'Team',
      color: '#8b5cf6',
      badge: approvalsTab.visible ? approvalsTab.badge : undefined,
    },
    ...(showCoaching
      ? [{ key: 'coaching' as const, to: '/coaching', label: 'Coaching', color: '#22c55e' }]
      : []),
    ...(showGames
      ? [{ key: 'games' as const, to: '/games', label: 'Games', color: '#ea7800' }]
      : []),
    { key: 'schedule', to: '/schedule', label: 'Schedule', color: '#06b6d4' },
    { key: 'messages', to: '/messaging', label: 'Messages', color: '#545859' },
  ];
}

/**
 * Derive the Approvals tab's visibility and badge from a pending-approval
 * count (Requirement 8.1, 8.3, 8.4).
 *
 * Visible whenever the count is positive — for ANY role, not gated by
 * `users.role`: a caregiver affiliation is derived, not stored (Requirement
 * 6), so the same person could be Admin, Coach, and a caregiver of their own
 * child all at once (Requirement 6's own example). Gating this tab by role
 * would hide it from exactly the people who need it.
 *
 * A non-finite or negative count (a defensive default on fetch failure —
 * Requirement 8.1, task 12.2) is treated as zero rather than throwing.
 */
export function resolveApprovalsTab(pendingApprovalCount: number): ApprovalsTabState {
  const count = Number.isFinite(pendingApprovalCount) ? pendingApprovalCount : 0;
  const safeCount = count > 0 ? count : 0;
  return { visible: safeCount > 0, badge: safeCount };
}
