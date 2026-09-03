import { useState } from 'react';
import { gantApi } from '../lib/gant-api';

/**
 * The Progress Notes capture sheet — records ONE raw observation about a
 * player or a team. Deliberately does nothing else: no Gant call happens
 * here, no refined output is shown. Capture and review are two separate
 * surfaces by design (repo owner's explicit instruction, 2026-09-03) so
 * quick-fire capture (dictate, submit, move to the next player) never waits
 * on an API round-trip.
 *
 * Spec: .kiro/specs/gant-ai-feedback-assistant/ (Task 5.2)
 * Requirements Section 3.1; design.md Section 3.1.
 *
 * team/player/event context is always supplied by the caller (the
 * person-detail screen, the Games-page quick link, or the roster) — this
 * component never shows its own team/player picker (Requirement 1.1: "there
 * is no separate dedicated Gant page with its own team/player pickers").
 */

const GANT_ACCENT = '#d97706';

export interface GantCaptureSheetProps {
  teamId: string;
  teamName: string;
  /** null = this capture is about the team, not an individual player. */
  playerId: string | null;
  playerName: string | null;
  eventType?: 'game' | 'training' | 'video_review';
  eventId?: string;
  onClose: () => void;
  onCaptured: () => void;
  /** Optional — this component always shows its own inline error too, same fix as GantReviewModal (found live 2026-09-03). */
  onError?: (message: string) => void;
}

export function GantCaptureSheet({
  teamId,
  teamName,
  playerId,
  playerName,
  eventType,
  eventId,
  onClose,
  onCaptured,
  onError,
}: GantCaptureSheetProps) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [justCaptured, setJustCaptured] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  async function handleCapture() {
    const trimmed = text.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setInlineError(null);
    try {
      await gantApi.createPendingEntry({
        teamId,
        playerId,
        eventType: eventType ?? null,
        eventId: eventId ?? null,
        rawText: trimmed,
      });
      setText('');
      setJustCaptured(true);
      onCaptured();
      // Brief confirmation, then stay open — quick-fire capture (Requirement
      // 3.1.3): the coach can keep capturing without navigating away.
      setTimeout(() => setJustCaptured(false), 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not capture this note.';
      setInlineError(message);
      onError?.(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-gray-200">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: GANT_ACCENT }}>
            Progress Notes
          </p>
          <h2 className="text-xl font-bold text-gray-900 mt-1">{playerName || `${teamName} (team)`}</h2>
          {playerName && <p className="text-sm text-gray-500 mt-1">{teamName}</p>}
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-3">
          <label className="block text-xs font-medium text-gray-500 uppercase">
            Capture a note (type or dictate)
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={submitting}
            rows={5}
            autoFocus
            placeholder="What did you notice? Doesn't need to be tidy — Gant will help refine it later."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 disabled:bg-gray-50"
            style={{ '--tw-ring-color': GANT_ACCENT } as React.CSSProperties}
          />
          {justCaptured && (
            <p className="text-sm font-medium" style={{ color: GANT_ACCENT }}>
              ✓ Captured — you can add another, or close this and review later.
            </p>
          )}
          {inlineError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">{inlineError}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Done
          </button>
          <button
            onClick={handleCapture}
            disabled={submitting || !text.trim()}
            className="flex-1 px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50"
            style={{ backgroundColor: GANT_ACCENT }}
          >
            {submitting ? 'Capturing…' : 'Capture'}
          </button>
        </div>
      </div>
    </div>
  );
}
