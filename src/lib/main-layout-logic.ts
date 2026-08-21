// Pure logic for the bottom-nav Caregiver Approvals tab.
//
// Spec: `.kiro/specs/add-player-and-dob-age-model/` (task 12.1)
//
// Kept free of React so the visibility/badge decision can be unit- and
// property-tested without rendering `MainLayout.tsx` — this codebase has no
// component-rendering test harness (see the 10.6/11.3 notes in tasks.md).

/** Whether the Approvals tab shows, and what its badge reads, for one user. */
export interface ApprovalsTabState {
  visible: boolean;
  badge: number;
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
