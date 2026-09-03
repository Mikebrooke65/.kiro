import { ApiClient, ApiError } from './api-client';
import type {
  GantPendingEntry,
  GantRawRound,
  GantResponse,
  GantGuardrails,
  GantOutcome,
} from '../types/database';

/**
 * Client wrapper for Progress Notes (internal name "Gant") — capture,
 * review, and resolution.
 *
 * Spec: .kiro/specs/gant-ai-feedback-assistant/ (Task 3.1, Task 5.1)
 *
 * PRIVACY: never send a name/email/DOB through `review()` — only a
 * `player_id` (as `subjectUserId`) plus text/tags/dates ever reach the
 * `gant-refine` Edge Function (Requirement 8.1). This wrapper's method
 * signatures don't accept those fields at all, so there is nothing to
 * accidentally leak.
 */

export interface ReviewRequestParams {
  scope: 'team' | 'player';
  subjectUserId?: string; // required when scope === 'player'
  eventType?: 'game' | 'training' | 'video_review';
  /** The team's age group (e.g. "U9", "Open") — already-known data, never asked for. Found live 2026-09-03. */
  ageGroup?: string;
  rounds: string[]; // the FULL accumulated round history, oldest first (Req 4.5)
  /** Gant's own most recent response, so a "Work on" round is understood as building on it, not a disconnected new fragment. Found live 2026-09-03. */
  priorResponse?: GantResponse;
  recentHistory?: { text: string; phaseTags: string[]; date: string }[]; // Req 4.9
}

export interface SummarizeRequestParams {
  subjectUserId: string;
  notes: { text: string; phaseTags: string[]; date: string }[];
}

class GantApi extends ApiClient {
  // -- Capture (Task 5) -----------------------------------------------------

  /**
   * Create a new pending entry (Requirement 3.1). No Gant call happens
   * here — refinement is triggered only when the coach opens the entry in
   * Review (Requirement 3.1.2, decided 2026-09-03), which keeps quick-fire
   * capture free of API round-trips.
   */
  async createPendingEntry(params: {
    teamId: string;
    playerId?: string | null;
    eventType?: 'game' | 'training' | 'video_review' | null;
    eventId?: string | null;
    rawText: string;
  }): Promise<GantPendingEntry> {
    const { data: authData } = await this.supabase.auth.getUser();
    const now = new Date().toISOString();

    return this.insert<GantPendingEntry>('gant_pending_entries', {
      team_id: params.teamId,
      player_id: params.playerId ?? null,
      event_type: params.eventType ?? null,
      event_id: params.eventId ?? null,
      raw_text: [{ text: params.rawText, at: now }] as unknown as GantRawRound[],
      captured_by: authData.user?.id,
    });
  }

  /** All of the current coach's unresolved pending entries (Requirement 5.1). */
  async getMyPendingEntries(filters?: { teamId?: string; playerId?: string }): Promise<GantPendingEntry[]> {
    let query = this.supabase
      .from('gant_pending_entries')
      .select('*')
      .order('captured_at', { ascending: true }); // oldest first — "work through what's waiting" (design.md Section 5)

    if (filters?.teamId) query = query.eq('team_id', filters.teamId);
    if (filters?.playerId) query = query.eq('player_id', filters.playerId);

    const { data, error } = await query;
    if (error) throw new ApiError(error.message);
    return data as GantPendingEntry[];
  }

  async getPendingEntry(id: string): Promise<GantPendingEntry> {
    return this.queryOne<GantPendingEntry>('gant_pending_entries', id);
  }

  // -- Review (Task 3) -------------------------------------------------------

  /**
   * Call Gant to refine (or ask a clarifying question about) the
   * accumulated round history. Does NOT persist anything — the caller
   * decides what to do with the response (cache it on the pending entry,
   * show it in the review screen) via a separate update.
   */
  async review(params: ReviewRequestParams): Promise<GantResponse> {
    const { data: result, error } = await this.supabase.functions.invoke('gant-refine', {
      body: { mode: 'review', ...params },
    });

    if (error) {
      throw new ApiError(await extractFunctionError(error, 'Gant could not refine this entry.'));
    }
    if (result?.error) {
      throw new ApiError(typeof result.error === 'string' ? result.error : 'Gant could not refine this entry.');
    }

    return result as GantResponse;
  }

  /**
   * Cache the latest Gant response on the pending entry, without resolving
   * it — used right after `review()` succeeds, so re-opening the entry
   * later shows the cached response instead of re-calling Gant
   * (design.md Section 4.1's refine-on-open cache check).
   */
  async cacheGantResponse(entryId: string, response: GantResponse): Promise<GantPendingEntry> {
    return this.update<GantPendingEntry>('gant_pending_entries', entryId, {
      last_gant_response: response as unknown as GantPendingEntry['last_gant_response'],
      updated_at: new Date().toISOString(),
    });
  }

  /**
   * Add a new "Work on" round to a pending entry's accumulated history
   * (Requirement 4.5) and bump its round_count. Returns the updated entry;
   * the caller is expected to call `review()` again afterwards with the
   * full updated round history.
   */
  async addWorkOnRound(entryId: string, rounds: GantRawRound[], newRoundCount: number): Promise<GantPendingEntry> {
    return this.update<GantPendingEntry>('gant_pending_entries', entryId, {
      raw_text: rounds as unknown as GantPendingEntry['raw_text'],
      round_count: newRoundCount,
      updated_at: new Date().toISOString(),
    });
  }

  /**
   * Approve (✓ Tick) a pending entry: save it as real feedback, log the
   * usage-signal outcome, and remove it from the pending queue. This is a
   * multi-step client-side sequence rather than one atomic server call —
   * acceptable here because a partial failure (e.g. the feedback insert
   * succeeds but the outcome log doesn't) leaves the pending entry in place
   * for a retry rather than silently losing data; the pending entry is only
   * deleted last, once everything else has succeeded.
   */
  async approve(params: {
    entryId: string;
    teamId: string;
    playerId: string | null;
    feedbackType: 'team' | 'player';
    feedbackText: string;
    eventId?: string | null;
    eventType?: 'game' | 'training' | 'video_review' | null;
    phaseTags?: string[];
    roundCount: number;
  }): Promise<void> {
    const { data: authData } = await this.supabase.auth.getUser();
    const resolvedBy = authData.user?.id;

    // `game_feedback.game_id` is a required FK to a real `events` row
    // (migrations 022/025). Capture (Task 5) doesn't currently ask the
    // coach to pick or create an event — most entries have no eventId at
    // all — so approve() creates a minimal ad-hoc placeholder event on the
    // fly rather than failing the whole Tick. Always `event_type='general'`
    // regardless of this note's own event_type label (stored separately on
    // game_feedback via migration 069): 'general' has no extra required
    // columns (unlike 'game', which needs opponent/home_away), so it's a
    // safe, universal FK target. Found and fixed 2026-09-03 during live
    // testing — see NEXT-SESSION-NOTES.md.
    let eventId = params.eventId;
    if (!eventId) {
      const now = new Date().toISOString();
      const adHocEvent = await this.insert<{ id: string } & Record<string, unknown>>('events', {
        title: 'Progress Notes entry',
        event_type: 'general',
        event_date: now,
        location: 'N/A',
        target_teams: [params.teamId],
        created_by: resolvedBy,
      });
      eventId = adHocEvent.id;
    }

    await this.insert('game_feedback', {
      game_id: eventId,
      team_id: params.teamId,
      feedback_type: params.feedbackType,
      player_id: params.playerId ?? undefined,
      feedback_text: params.feedbackText,
      event_type: params.eventType ?? undefined,
      phase_tags: params.phaseTags ?? [],
      gant_assisted: true,
      round_count: params.roundCount,
      created_by: resolvedBy,
    });

    await this.insert('gant_outcomes', {
      team_id: params.teamId,
      player_id: params.playerId ?? undefined,
      outcome: 'ticked',
      round_count: params.roundCount,
      resolved_by: resolvedBy,
    });

    await this.delete('gant_pending_entries', params.entryId);

    // Cached-on-approval auto-summary (Req 7.2, decided 2026-09-03): refresh
    // ONLY on an individual tick, not a team-scoped one (no single player to
    // summarise for). Best-effort — a summary failure must never undo an
    // already-successful save, so it's swallowed with a console warning
    // rather than thrown; the person-detail screen simply shows the
    // previous (or no) summary until the next successful tick.
    if (params.playerId) {
      try {
        const recentNotes = await this.getPlayerNotes(params.playerId);
        const last10 = recentNotes.slice(0, 10).map((n) => ({
          text: n.text,
          phaseTags: n.phaseTags,
          date: n.date,
        }));
        if (last10.length > 0) {
          const { summaryText } = await this.summarize({ subjectUserId: params.playerId, notes: last10 });
          await this.upsertPlayerSummary(params.playerId, summaryText);
        }
      } catch (err) {
        console.warn('Progress Notes: could not refresh the auto-summary after Tick', err);
      }
    }
  }

  /**
   * Discard (✗ Cross) a pending entry: log the outcome, then delete it.
   * Nothing is saved to game_feedback.
   */
  async discard(params: { entryId: string; teamId: string; playerId: string | null; roundCount: number }): Promise<void> {
    const { data: authData } = await this.supabase.auth.getUser();
    const resolvedBy = authData.user?.id;

    await this.insert('gant_outcomes', {
      team_id: params.teamId,
      player_id: params.playerId ?? undefined,
      outcome: 'crossed',
      round_count: params.roundCount,
      resolved_by: resolvedBy,
    });

    await this.delete('gant_pending_entries', params.entryId);
  }

  // -- Summarize (Task 7) -----------------------------------------------------

  /**
   * Cached-on-approval (Requirement 7.2, decided 2026-09-03) — this is
   * called by the `approve()` flow whenever an individual note is ticked,
   * never live-on-open by the person-detail screen. See Task 7 for the
   * caller-side wiring.
   */
  async summarize(params: SummarizeRequestParams): Promise<{ summaryText: string }> {
    const { data: result, error } = await this.supabase.functions.invoke('gant-refine', {
      body: { mode: 'summarize', ...params },
    });

    if (error) {
      throw new ApiError(await extractFunctionError(error, 'Gant could not generate a summary.'));
    }
    if (result?.error) {
      throw new ApiError(typeof result.error === 'string' ? result.error : 'Gant could not generate a summary.');
    }

    return result as { summaryText: string };
  }

  async upsertPlayerSummary(playerId: string, summaryText: string): Promise<void> {
    const { error } = await this.supabase
      .from('gant_player_summaries')
      .upsert({ player_id: playerId, summary_text: summaryText, generated_at: new Date().toISOString() });

    if (error) throw new ApiError(error.message);
  }

  // -- Reads for the person-detail / team-notes screens (Task 6/6b) -----------

  /**
   * A player's approved individual Progress Notes, newest first (Req 2.1.1).
   * Relies on migration 070's RLS: the player themselves, a linked
   * caregiver, or a coach/manager/admin. A plain other player/caregiver's
   * query simply returns zero rows — RLS enforced, not filtered client-side.
   */
  async getPlayerNotes(playerId: string): Promise<GantFeedbackNote[]> {
    const { data, error } = await this.supabase
      .from('game_feedback')
      .select('id, feedback_text, phase_tags, created_at, created_by:users!created_by(first_name, last_name)')
      .eq('feedback_type', 'player')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false });

    if (error) throw new ApiError(error.message);
    return (data ?? []).map(mapFeedbackRow);
  }

  /** A team's approved team-scoped Progress Notes, newest first (Req 6.5). */
  async getTeamNotes(teamId: string): Promise<GantFeedbackNote[]> {
    const { data, error } = await this.supabase
      .from('game_feedback')
      .select('id, feedback_text, phase_tags, created_at, created_by:users!created_by(first_name, last_name)')
      .eq('feedback_type', 'team')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });

    if (error) throw new ApiError(error.message);
    return (data ?? []).map(mapFeedbackRow);
  }

  /** The cached auto-summary for a player, or null if none exists yet (Req 7.2). */
  async getPlayerSummary(playerId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('gant_player_summaries')
      .select('summary_text')
      .eq('player_id', playerId)
      .maybeSingle();

    if (error) throw new ApiError(error.message);
    return data?.summary_text ?? null;
  }

  // -- Guardrails admin (Task 8.1) -------------------------------------------

  /**
   * Read the single guardrails row (Task 8.1). `maybeSingle()` returns null
   * (not an error) if the row is somehow absent — migration 071 seeds it, so
   * in practice it always exists. Readable by any coach/admin per the table's
   * RLS; only admins can write (enforced by `updateGuardrails` hitting the
   * admin-only write policy, and by the desktop route being admin-gated).
   */
  async getGuardrails(): Promise<GantGuardrails | null> {
    const { data, error } = await this.supabase
      .from('gant_guardrails')
      .select('*')
      .maybeSingle();

    if (error) throw new ApiError(error.message);
    return (data as GantGuardrails) ?? null;
  }

  /**
   * Update the single guardrails row (Task 8.1). Matches on the fixed
   * `id = true` single-row key. Bumps `updated_at`. Takes effect on Gant's
   * very next request — the Edge Function reads this row fresh every call
   * (no cache), so there's no redeploy or rebuild (Requirement 9.2).
   */
  async updateGuardrails(updates: {
    phases_of_play?: GantGuardrails['phases_of_play'];
    feedback_model?: string;
    tone_guide?: string;
    continuity_language?: string;
  }): Promise<GantGuardrails> {
    const { data, error } = await this.supabase
      .from('gant_guardrails')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', true)
      .select()
      .single();

    if (error) throw new ApiError(error.message);
    return data as GantGuardrails;
  }

  // -- Usage-signal export (Task 8.2) ----------------------------------------

  /**
   * All `gant_outcomes` rows for CSV export (Task 8.2), newest first, with
   * team and player names resolved so the exported file is human-readable
   * rather than a wall of UUIDs. Admin-only: the table's RLS returns zero
   * rows to a non-admin, and the desktop route is admin-gated anyway.
   */
  async getOutcomesForExport(): Promise<GantOutcomeExportRow[]> {
    const { data, error } = await this.supabase
      .from('gant_outcomes')
      .select(
        'id, outcome, round_count, resolved_at, ' +
          'team:teams!team_id(name, age_group), ' +
          'player:users!player_id(first_name, last_name)'
      )
      .order('resolved_at', { ascending: false });

    if (error) throw new ApiError(error.message);
    return (data ?? []).map(mapOutcomeRow);
  }
}

export interface GantFeedbackNote {
  id: string;
  text: string;
  phaseTags: string[];
  authorName: string;
  date: string;
}

function mapFeedbackRow(row: any): GantFeedbackNote {
  const author = row.created_by;
  return {
    id: row.id,
    text: row.feedback_text,
    phaseTags: row.phase_tags ?? [],
    authorName: author ? `${author.first_name} ${author.last_name}` : 'Coach',
    date: row.created_at,
  };
}

/** A single flattened, human-readable `gant_outcomes` row for CSV export (Task 8.2). */
export interface GantOutcomeExportRow {
  date: string;
  team: string;
  player: string;
  scope: 'team' | 'player';
  outcome: 'ticked' | 'crossed';
  rounds: number;
}

function mapOutcomeRow(row: any): GantOutcomeExportRow {
  const team = row.team;
  const player = row.player;
  const teamName = team ? `${team.age_group ?? ''} ${team.name ?? ''}`.trim() : '(unknown team)';
  // Sortable, unambiguous, spreadsheet-friendly: "2026-09-03 14:22" (UTC).
  const date = row.resolved_at ? new Date(row.resolved_at).toISOString().slice(0, 16).replace('T', ' ') : '';
  return {
    date,
    team: teamName,
    player: player ? `${player.first_name} ${player.last_name}` : '',
    scope: player ? 'player' : 'team',
    outcome: row.outcome,
    rounds: row.round_count,
  };
}

/**
 * `functions.invoke` surfaces non-2xx responses as an opaque error — the
 * useful message is in the response body, read off `error.context`. Same
 * approach as `email-api.ts` / `roles-api.ts`.
 */
async function extractFunctionError(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json();
      if (body?.error) {
        return typeof body.error === 'string' ? body.error : JSON.stringify(body.error);
      }
    } catch {
      // Body wasn't JSON — fall through to the generic message.
    }
  }
  return error instanceof Error ? error.message : fallback;
}

export const gantApi = new GantApi();
