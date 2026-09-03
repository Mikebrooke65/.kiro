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
  onClose: () => void;
  /** Called after a successful Tick (approve) or Cross (discard) — the caller removes the entry from any local list. */
  onResolved: (outcome: 'ticked' | 'crossed', entryId: string) => void;
  onError: (message: string) => void;
}

type Phase = 'loading' | 'ready' | 'submitting-workon' | 'submitting-resolve' | 'error';

export function GantReviewModal({
  entry,
  playerName,
  teamName,
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

  const actions = resolveReviewActions(response);

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
    try {
      const scope = playerName ? 'player' : 'team';
      const result = await gantApi.review({
        scope,
        subjectUserId: scope === 'player' ? entry.player_id ?? undefined : undefined,
        eventType: entry.event_type ?? undefined,
        rounds: roundsAsPlainText(rounds),
      });
      setResponse(result);
      setRoundCountAtLastResponse(rounds.length);
      await gantApi.cacheGantResponse(entry.id, result);
      setPhase('ready');
    } catch (err) {
      setPhase('error');
      onError(err instanceof Error ? err.message : 'Gant could not refine this entry.');
    }
  }

  async function handleWorkOnSubmit() {
    const text = workOnText.trim();
    if (!text) return;

    setPhase('submitting-workon');
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
        rounds: roundsAsPlainText(newRounds),
      });
      setResponse(result);
      setRoundCountAtLastResponse(newRounds.length);
      await gantApi.cacheGantResponse(entry.id, result);
      setPhase('ready');
    } catch (err) {
      setPhase('ready');
      onError(err instanceof Error ? err.message : 'Gant could not refine this entry.');
    }
  }

  async function handleTick() {
    if (!response || response.kind !== 'refined') return;
    setPhase('submitting-resolve');
    try {
      await gantApi.approve({
        entryId: entry.id,
        teamId: entry.team_id,
        playerId: entry.player_id ?? null,
        feedbackType: playerName ? 'player' : 'team',
        feedbackText: response.text,
        eventId: entry.event_id ?? entry.id, // fallback should not occur in practice — event_id is required by capture UI (Task 5)
        eventType: entry.event_type,
        phaseTags: response.phaseTags,
        roundCount: rounds.length,
      });
      onResolved('ticked', entry.id);
    } catch (err) {
      setPhase('ready');
      onError(err instanceof Error ? err.message : 'Could not save this note.');
    }
  }

  async function handleCross() {
    setPhase('submitting-resolve');
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
      onError(err instanceof Error ? err.message : 'Could not discard this note.');
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

        {/* Footer actions (Requirement 4.3) */}
        <div className="p-4 border-t border-gray-200 flex gap-2">
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
              className="flex-1 px-4 py-2 rounded-lg border font-medium disabled:opacity-50"
              style={{ borderColor: GANT_ACCENT, color: GANT_ACCENT }}
            >
              Work on
            </button>
          )}
          {actions.canTick && (
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
