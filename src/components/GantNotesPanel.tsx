import { useEffect, useState } from 'react';
import { gantApi, type GantFeedbackNote } from '../lib/gant-api';

/**
 * The Progress Notes feed — a summary card pinned above a newest-first list.
 * Shared shape for both the person-detail screen (individual notes) and the
 * Team roster page's team-notes section (Req 6.5) — the caller supplies
 * which notes/summary to show; this component only renders.
 *
 * Spec: .kiro/specs/gant-ai-feedback-assistant/ (Task 6.4, Task 6b.1, Task 7.3)
 * Requirements Section 2.1, 6.5, 7.
 *
 * DISCLOSURE (Requirement 6.4/8.3): never renders `gant_assisted`,
 * `round_count`, or any hint that Gant was involved — every note reads as
 * simply from its author.
 */

const GANT_ACCENT = '#d97706';

export interface GantNotesPanelProps {
  /** 'player' shows the cached auto-summary (Req 7.2/7.3); 'team' has no summary yet (Req 12.1 was resolved to reuse this same pattern, but a team-level summary wasn't specified — omitted rather than guessed). */
  scope: 'player' | 'team';
  subjectId: string; // playerId or teamId depending on scope
}

export function GantNotesPanel({ scope, subjectId }: GantNotesPanelProps) {
  const [notes, setNotes] = useState<GantFeedbackNote[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (scope === 'player') {
          const [notesResult, summaryResult] = await Promise.all([
            gantApi.getPlayerNotes(subjectId),
            gantApi.getPlayerSummary(subjectId),
          ]);
          if (cancelled) return;
          setNotes(notesResult);
          setSummary(summaryResult);
        } else {
          const notesResult = await gantApi.getTeamNotes(subjectId);
          if (cancelled) return;
          setNotes(notesResult);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load Progress Notes.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [scope, subjectId]);

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="h-16 bg-gray-100 rounded-lg animate-pulse" />
        <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  return (
    <div className="space-y-3">
      {/* Auto-summary — cached-on-approval, never regenerated just by viewing (Req 7.2) */}
      {scope === 'player' && summary && (
        <div
          className="rounded-lg p-3 border"
          style={{ borderColor: GANT_ACCENT, backgroundColor: 'rgba(217, 119, 6, 0.06)' }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: GANT_ACCENT }}>
            Recent overview
          </p>
          <p className="text-sm text-gray-800">{summary}</p>
        </div>
      )}

      {/* Notes list, newest first (Req 2.1.1) */}
      {notes.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-100 p-6 text-center">
          <p className="text-sm text-gray-500">No Progress Notes yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div key={note.id} className="bg-white rounded-lg border border-gray-100 p-3">
              <p className="text-sm text-gray-800">{note.text}</p>
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-gray-500">
                  {note.authorName} ·{' '}
                  {new Date(note.date).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
                {note.phaseTags.length > 0 && (
                  <div className="flex gap-1">
                    {note.phaseTags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: 'rgba(217, 119, 6, 0.12)', color: '#92400e' }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
