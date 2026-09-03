import { useEffect, useState } from 'react';
import { gantApi } from '../lib/gant-api';
import {
  appendWorkOnRound,
  needsFreshGantCall,
  resolveReviewActions,
  roundsAsPlainText,
} from '../lib/gant-review-logic';
import type { GantPendingEntry, GantRawRound, GantResponse } from '../types/database';

/**
 * The Progress Notes review screen — the tick / cross / Work-on loop.
 *
 * Spec: .kiro/specs/gant-ai-feedback-assistant/ (Task 3.3)
 * Requirements Section 4; design.md Section 4.
 *
 * Reused Schedule.tsx's proven mobile modal pattern (`z-[60]`,
 * `max-h-[85vh]`, `flex flex-col` with a pinned header/footer and a
 * scrolling body) per the project's own modal-layout standard.
 *
 * BRANDING (Requirement 13): every Progress Notes surface uses one
 * consistent accent colour, distinct from the six reserved page colours —
 * `#d97706` (Tailwind amber-600), applied to the header, phase tags, and
 * primary actions here.
 */

const GANT_ACCENT = '#d97706';

export interface GantReviewModalProps {
  entry: GantPendingEntry;
  playerName: string | null; // null for a team-scoped entry
  teamName: string;
  /** The team's age group (e.g. "U9", "Open") — passed through to Gant so it never has to ask. Found live 2026-09-03. */
  ageGroup?: string;
  onClose: () => void;
  /** Called after a successful Tick (approve) or Cross (discard) — the caller removes the entry from any local list. */
  onResolved: (outcome: 'ticked' | 'crossed', entryId: string) => void;
  /**
   * Optional — still called so a caller can also log/track the failure
   * elsewhere, but no longer the only place the error is shown. Found live
   * 2026-09-03: a caller that only surfaces this on the page BEHIND this
   * modal (e.g. a banner state) leaves the failure completely invisible —
   * the modal is a full-screen z-[60] overlay, so nothing under it is
   * visible. This component now ALWAYS renders its own inline error too.
   */
  onError?: (message: string) => void;
}

type Phase = 'loading' | 'ready' | 'submitting-workon' | 'submitting-resolve' | 'error';

export function GantReviewModal({
  entry,
  playerName,
  teamName,
  ageGroup,
  onClose,
  onResolved,
  onError,
}: GantReviewModalProps) {
  const [rounds, setRounds] = useState<GantRawRound[]>(entry.raw_text ?? []);
  const [response, setResponse] = useState<GantResponse | null>(entry.last_gant_response ?? null);
  const [roundCountAtLastResponse, setRoundCountAtLastResponse] = useState<number | null>(
    entry.last_gant_response ? entry.round_count : null
  );
  const [phase, setPhase] = useState<Phase>('loading');
  const [workOnText, setWorkOnText] = useState('');
  const [inlineError, setInlineError] = useState<string | null>(null);

  const actions = resolveReviewActions(response);
  // There's typed-but-not-yet-processed text in "Add more" — Save must be
  // hidden while this is true (decided 2026-09-03), since saving would tick
  // the current refined note and silently discard the coach's addition.
  const hasUnsavedWorkOn = workOnText.trim().length > 0;

  function reportError(message: string) {
    setInlineError(message);
    onError?.(message);
  }

  useEffect(() => {
    // Refine-on-open (Requirement 3.1.2, design.md Section 4.1): only call
    // Gant if there's genuinely nothing cached yet, or new rounds have been
    // added since the cached response — never just because the screen opened.
    if (needsFreshGantCall(response, rounds.length, roundCountAtLastResponse)) {
      void callGant();
    } else {
      setPhase('ready');
    }
    // Intentionally run once on mount — subsequent calls happen explicitly
    // from handleWorkOnSubmit, not via a dependency-driven re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function callGant() {
    setPhase('loading');
    setInlineError(null);
    try {
      const scope = playerName ? 'player' : 'team';
      const result = await gantApi.review({
        scope,
        subjectUserId: scope === 'player' ? entry.player_id ?? undefined : undefined,
        eventType: entry.event_type ?? undefined,
        ageGroup,
        rounds: roundsAsPlainText(rounds),
        // The entry's OWN cached response (if this is a re-open, not a
        // brand-new entry) — always the latest one, since it's whatever was
        // cached the last time Gant responded. Undefined on a genuinely
        // first-ever call.
        priorResponse: response ?? undefined,
      });
      setResponse(result);
      setRoundCountAtLastResponse(rounds.length);
      await gantApi.cacheGantResponse(entry.id, result);
      setPhase('ready');
    } catch (err) {
      setPhase('error');
      reportError(err instanceof Error ? err.message : 'Gant could not refine this entry.');
    }
  }

  async function handleWorkOnSubmit() {
    const text = workOnText.trim();
    if (!text) return;

    // Capture Gant's response as it stands RIGHT NOW, before this round's
    // new call overwrites `response` state — this is always the most recent
    // output regardless of how many "Work on" rounds have already
    // happened, since `response` is updated to the latest result after
    // every single call (both here and in callGant). Fixes the bug found
    // live 2026-09-03 where a further "Work on" round had no memory of
    // Gant's own prior answer and regressed to asking basic questions.
    const priorResponse = response ?? undefined;

    setPhase('submitting-workon');
    setInlineError(null);
    try {
      const newRounds = appendWorkOnRound(rounds, text, new Date().toISOString());
      await gantApi.addWorkOnRound(entry.id, newRounds, newRounds.length);
      setRounds(newRounds);
      setWorkOnText('');

      const scope = playerName ? 'player' : 'team';
      const result = await gantApi.review({
        scope,
        subjectUserId: scope === 'player' ? entry.player_id ?? undefined : undefined,
        eventType: entry.event_type ?? undefined,
        ageGroup,
        rounds: roundsAsPlainText(newRounds),
        priorResponse,
      });
      setResponse(result);
      setRoundCountAtLastResponse(newRounds.length);
      await gantApi.cacheGantResponse(entry.id, result);
      setPhase('ready');
    } catch (err) {
      setPhase('ready');
      reportError(err instanceof Error ? err.message : 'Gant could not refine this entry.');
    }
  }

  async function handleTick() {
    if (!response || response.kind !== 'refined') return;
    setPhase('submitting-resolve');
    setInlineError(null);
    try {
      await gantApi.approve({
        entryId: entry.id,
        teamId: entry.team_id,
        playerId: entry.player_id ?? null,
        feedbackType: playerName ? 'player' : 'team',
        feedbackText: response.text,
        // Capture-queue entries have no event_id (no event picker in capture
        // yet). Pass undefined — NOT entry.id — so approve() creates the
        // ad-hoc placeholder event. entry.id is a gant_pending_entries id,
        // not an events id; passing it as game_id would violate the FK (and
        // silently skip ad-hoc creation). Found tracing the live save bug,
        // 2026-09-03.
        eventId: entry.event_id ?? undefined,
        eventType: entry.event_type,
        phaseTags: response.phaseTags,
        roundCount: rounds.length,
      });
      onResolved('ticked', entry.id);
    } catch (err) {
      setPhase('ready');
      reportError(err instanceof Error ? err.message : 'Could not save this note.');
    }
  }

  async function handleCross() {
    setPhase('submitting-resolve');
    setInlineError(null);
    try {
      await gantApi.discard({
        entryId: entry.id,
        teamId: entry.team_id,
        playerId: entry.player_id ?? null,
        roundCount: rounds.length,
      });
      onResolved('crossed', entry.id);
    } catch (err) {
      setPhase('ready');
      reportError(err instanceof Error ? err.message : 'Could not discard this note.');
    }
  }

  const isBusy = phase === 'loading' || phase === 'submitting-workon' || phase === 'submitting-resolve';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-gray-200" style={{ borderTopColor: GANT_ACCENT }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: GANT_ACCENT }}>
            Progress Notes
          </p>
          <h2 className="text-xl font-bold text-gray-900 mt-1">{playerName || teamName}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {teamName}
            {entry.event_type && ` · ${formatEventType(entry.event_type)}`}
            {' · '}
            {new Date(entry.captured_at).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
        </div>

        {/* Scrollable content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* Found live 2026-09-03: an error reported only to the page BEHIND
              this modal is invisible (this overlay is z-[60], full-screen) —
              the button visually resets with no explanation. Always show it
              here instead. */}
          {inlineError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">{inlineError}</p>
            </div>
          )}

          {/* Original input — cumulative round history, always visible (Requirement 4.1) */}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase mb-1">Your notes</p>
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              {rounds.map((round, i) => (
                <p key={i} className="text-sm text-gray-700">
                  {round.text}
                </p>
              ))}
            </div>
          </div>

          {/* Gant's response — two visual states (Requirement 4.2) */}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase mb-1">
              {response?.kind === 'question' ? 'Gant needs a bit more' : 'Gant\'s refined note'}
            </p>
            {phase === 'loading' && !response ? (
              <div className="rounded-lg p-3 border border-gray-200 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            ) : response ? (
              <div
                className={`rounded-lg p-3 border ${
                  response.kind === 'question' ? 'border-amber-300 border-dashed' : 'border-gray-200'
                }`}
                style={
                  response.kind === 'question'
                    ? { backgroundColor: 'rgba(217, 119, 6, 0.08)' }
                    : { backgroundColor: 'rgba(217, 119, 6, 0.04)' }
                }
              >
                <p className="text-sm text-gray-800">{response.text}</p>
                {response.kind === 'refined' && response.phaseTags && response.phaseTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {response.phaseTags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: 'rgba(217, 119, 6, 0.15)', color: '#92400e' }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Work-on input — same free-form control for every round (Requirement 4.5, 4.7) */}
          {phase !== 'loading' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                Add more (type or dictate)
              </label>
              <textarea
                value={workOnText}
                onChange={(e) => setWorkOnText(e.target.value)}
                disabled={isBusy}
                rows={3}
                placeholder={
                  response?.kind === 'question'
                    ? 'Answer the question above...'
                    : 'Add detail, a correction, or anything else...'
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 disabled:bg-gray-50"
                style={{ '--tw-ring-color': GANT_ACCENT } as React.CSSProperties}
              />
            </div>
          )}
        </div>

        {/* Footer actions (Requirement 4.3).
            When there's unsaved text in "Add more", Save is HIDDEN entirely
            (decided 2026-09-03) — saving would tick the CURRENT refined note
            and silently throw away what the coach just typed. "Work on" is
            the only forward path in that state, so it becomes the emphasised
            (filled) button; once the text is processed and the box is empty
            again, Save comes back. */}
        <div className="p-4 border-t border-gray-200 space-y-2">
          {hasUnsavedWorkOn && (
            <p className="text-xs text-gray-500 text-center">
              Tap <span className="font-medium" style={{ color: GANT_ACCENT }}>Work on</span> to
              fold your addition in — then you can save.
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleCross}
              disabled={isBusy}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              ✗ Discard
            </button>
            {actions.canWorkOn && (
              <button
                onClick={handleWorkOnSubmit}
                disabled={isBusy || !workOnText.trim()}
                className={
                  hasUnsavedWorkOn
                    ? 'flex-1 px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50'
                    : 'flex-1 px-4 py-2 rounded-lg border font-medium disabled:opacity-50'
                }
                style={
                  hasUnsavedWorkOn
                    ? { backgroundColor: GANT_ACCENT }
                    : { borderColor: GANT_ACCENT, color: GANT_ACCENT }
                }
              >
                Work on
              </button>
            )}
            {actions.canTick && !hasUnsavedWorkOn && (
              <button
                onClick={handleTick}
                disabled={isBusy}
                className="flex-1 px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50"
                style={{ backgroundColor: GANT_ACCENT }}
              >
                ✓ Save
              </button>
            )}
          </div>
        </div>

        {/* Cancel / close without resolving — leaves the entry pending (Requirement 5.1) */}
        <button
          onClick={onClose}
          disabled={isBusy}
          className="text-center text-xs text-gray-400 hover:text-gray-600 pb-3 disabled:opacity-50"
        >
          Close and leave pending
        </button>
      </div>
    </div>
  );
}

function formatEventType(eventType: 'game' | 'training' | 'video_review'): string {
  switch (eventType) {
    case 'game':
      return 'Game';
    case 'training':
      return 'Training';
    case 'video_review':
      return 'Video review';
  }
}
