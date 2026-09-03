import { useState } from 'react';
import { GantNotesPanel } from './GantNotesPanel';
import { GantCaptureSheet } from './GantCaptureSheet';

/**
 * The person-detail screen — v1 scope is notes-only (Requirement 2, 2.2).
 * Reached by tapping a roster row on the Team page.
 *
 * Spec: .kiro/specs/gant-ai-feedback-assistant/ (Task 6.2/6.3/6.4/6.6)
 *
 * Permission model (Requirement 1.2):
 *  - self/caregiver-of-linked-child: view-only.
 *  - coach/admin: view + add a new note from right here.
 *
 * Implemented as a modal over the Team page rather than a separate route
 * (`/team/person/:userId`) — design.md left this open; a modal keeps the
 * roster's own team-selection context trivially intact and matches every
 * other Team-page overlay (Add Player, Add Caregiver, Remove confirmation).
 */

const GANT_ACCENT = '#d97706';

export interface GantPersonDetailModalProps {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  /** Requirement 1.2/6.2: coach, admin, or a manager with coach authority. */
  canAddNote: boolean;
  onClose: () => void;
}

export function GantPersonDetailModal({
  playerId,
  playerName,
  teamId,
  teamName,
  canAddNote,
  onClose,
}: GantPersonDetailModalProps) {
  const [showCapture, setShowCapture] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  // Bumping this key re-mounts GantNotesPanel, which re-fetches — cheap way
  // to reflect a just-captured note's presence in the pending state without
  // a dedicated refetch method (the note itself only appears here once
  // reviewed and ticked, not on capture — capture only affects the pending
  // queue, elsewhere).
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-gray-200 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: GANT_ACCENT }}>
              Progress Notes
            </p>
            <h2 className="text-xl font-bold text-gray-900 mt-1">{playerName}</h2>
            <p className="text-sm text-gray-500 mt-1">{teamName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Close">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          <GantNotesPanel key={refreshKey} scope="player" subjectId={playerId} />
        </div>

        {/* Add-note entry point — coach/admin only (Requirement 2.1.4, 6.2) */}
        {canAddNote && (
          <div className="p-4 border-t border-gray-200 space-y-2">
            {captureError && <p className="text-sm text-red-600">{captureError}</p>}
            <button
              onClick={() => setShowCapture(true)}
              className="w-full px-4 py-2 rounded-lg text-white font-medium"
              style={{ backgroundColor: GANT_ACCENT }}
            >
              + Add a note
            </button>
          </div>
        )}
      </div>

      {showCapture && (
        <GantCaptureSheet
          teamId={teamId}
          teamName={teamName}
          playerId={playerId}
          playerName={playerName}
          onClose={() => {
            setShowCapture(false);
            setRefreshKey((k) => k + 1);
          }}
          onCaptured={() => setRefreshKey((k) => k + 1)}
          onError={setCaptureError}
        />
      )}
    </div>
  );
}
