// Pure logic for the Progress Notes review loop (tick / cross / Work-on).
//
// Spec: .kiro/specs/gant-ai-feedback-assistant/ (Task 3.2)
// Requirements Section 4 (the review loop, requirements.md); design.md
// Section 4.
//
// Deliberately free of React and Supabase so the round-accumulation and
// state-transition rules can be unit-tested in isolation.

import type { GantRawRound, GantResponse } from '../types/database';

/**
 * What the review screen should render/allow for a given Gant response.
 * Mirrors design.md Section 4.1's two visual states 1:1 — no client-side
 * inference beyond reading `kind` off the response (Section 4.3, decided
 * 2026-09-03 during the working session).
 */
export interface ReviewActions {
  canTick: boolean;
  canCross: boolean;
  canWorkOn: boolean;
}

/**
 * Requirement 4.3: a refined comment offers Tick/Cross/Work-on; a
 * clarifying question offers only Cross/Work-on (no Tick — you can't
 * approve a question). `null` (no response yet, e.g. first open still
 * loading) offers none — the screen should be showing a loading state, not
 * action buttons.
 */
export function resolveReviewActions(response: GantResponse | null): ReviewActions {
  if (!response) {
    return { canTick: false, canCross: false, canWorkOn: false };
  }
  if (response.kind === 'refined') {
    return { canTick: true, canCross: true, canWorkOn: true };
  }
  // kind === 'question'
  return { canTick: false, canCross: true, canWorkOn: true };
}

/**
 * Requirement 4.5: appends a new "Work on" round to the accumulated history.
 * Never mutates the input array. No cap on round count (Requirement 4.6,
 * decided 2026-09-03) — this function enforces nothing here; the absence of
 * any limit check IS the implementation of "no cap."
 */
export function appendWorkOnRound(rounds: GantRawRound[], text: string, at: string): GantRawRound[] {
  return [...rounds, { text, at }];
}

/**
 * Requirement 3.1.2 / design.md Section 4.1's refine-on-open mechanic,
 * decided 2026-09-03: a fresh Gant call is needed only when there is no
 * cached response yet (the entry's very first open) — NOT simply because
 * the screen was opened again. `roundCountAtLastResponse` is the
 * `round_count` value that was current when `lastResponse` was produced;
 * if the entry's current round count has moved past that (a new "Work on"
 * round was added since), a fresh call is needed too.
 */
export function needsFreshGantCall(
  lastResponse: GantResponse | null,
  currentRoundCount: number,
  roundCountAtLastResponse: number | null
): boolean {
  if (!lastResponse) return true;
  if (roundCountAtLastResponse === null) return true;
  return currentRoundCount > roundCountAtLastResponse;
}

/** The two ways a pending entry can be resolved (Requirement 5.3, 10.1). */
export type ReviewOutcome = 'ticked' | 'crossed';

/**
 * Requirement 4.5: the accumulated raw text sent to Gant on every call is
 * the FULL round history (original capture + every Work-on round so far),
 * not just the latest addition — Gant needs the whole conversation to
 * produce a coherent refinement.
 */
export function roundsAsPlainText(rounds: GantRawRound[]): string[] {
  return rounds.map((r) => r.text);
}
