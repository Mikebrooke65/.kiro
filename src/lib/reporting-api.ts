import { ApiClient } from './api-client';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export interface ReportFilters {
  dateFrom?: string;
  dateTo?: string;
  teamId?: string;
  coachId?: string;
  ageGroup?: string;
  skillCategory?: string;
  minDeliveries?: number;
}

export interface LessonDeliveryRow {
  id: string;
  lessonName: string;
  skillCategory: string;
  coachName: string;
  teamName: string;
  ageGroup: string;
  dateDelivered: string;
  lessonVersion: number;
  notes: string | null;
}

export interface CoachActivityRow {
  coachId: string;
  coachName: string;
  lessonsDelivered: number;
  gameFeedbackCount: number;
  lastActivityDate: string | null;
  teamsCoached: string[];
}

export interface TeamTrainingRow {
  teamName: string;
  ageGroup: string;
  lessonName: string;
  skillCategory: string;
  dateDelivered: string;
  coachName: string;
  lessonVersion: number;
}

export interface FilterOptions {
  teams: { id: string; name: string; ageGroup: string }[];
  coaches: { id: string; name: string }[];
  skillCategories: string[];
}

// Phase 2: Feedback Analysis Interfaces
export interface LessonEffectivenessRow {
  lessonId: string;
  lessonName: string;
  skillCategory: string;
  ageGroup: string;
  deliveryCount: number;
  feedbackCount: number;
  averageRating: number | null;
}

export interface SessionRatingsRow {
  sessionId: string;
  sessionName: string;
  sessionType: string;
  skillCategory: string;
  deliveryCount: number;
  feedbackCount: number;
  averageRating: number | null;
}

/**
 * Shape of a game_feedback row for reporting, matching the LIVE schema
 * (migrations 022 + 025 + 069) — free-text feedback per team or per player,
 * tied to an event. This replaces a previous shape (attackingWww,
 * transitionAdWww, etc.) that queried "4 Moments of Football" columns
 * dropped by migration 022 in 2026-08 — that query threw a Postgrest error
 * on every load, since those columns never existed in the live table this
 * report reads from. Fixed alongside the Gant/Progress Notes build (same
 * table, additive columns) — see
 * .kiro/specs/gant-ai-feedback-assistant/tasks.md Task 1.6.
 */
export interface GameFeedbackRow {
  id: string;
  teamName: string;
  ageGroup: string;
  gameDate: string;
  opponent: string | null;
  coachName: string;
  feedbackType: 'team' | 'player';
  playerName: string | null;
  feedbackText: string;
  phaseTags: string[];
}

export interface FeedbackDetail {
  id: string;
  rating: number;
  comment: string | null;
  coachName: string;
  teamName: string;
  date: string;
}

// ============================================================================
// Reporting API Client
// ============================================================================

export class ReportingApi extends ApiClient {
  
  /**
   * Fetch lesson deliveries with filters
   */
  async getLessonDeliveries(filters: ReportFilters): Promise<LessonDeliveryRow[]> {
    try {
      let query = this.supabase
        .from('lesson_deliveries')
        .select(`
          id,
          delivery_date,
          notes,
          lessons!inner(title, skill_category, version),
          teams!inner(name, age_group),
          users!inner(first_name, last_name)
        `)
        .order('delivery_date', { ascending: false })
        .limit(100);

      // Apply filters
      if (filters.dateFrom) {
        query = query.gte('delivery_date', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('delivery_date', filters.dateTo);
      }
      if (filters.teamId) {
        query = query.eq('team_id', filters.teamId);
      }
      if (filters.coachId) {
        query = query.eq('coach_id', filters.coachId);
      }
      if (filters.ageGroup) {
        query = query.eq('teams.age_group', filters.ageGroup);
      }
      if (filters.skillCategory) {
        query = query.eq('lessons.skill_category', filters.skillCategory);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Transform to LessonDeliveryRow format
      return (data || []).map((row: any) => ({
        id: row.id,
        lessonName: row.lessons.title,
        skillCategory: row.lessons.skill_category,
        coachName: `${row.users.first_name} ${row.users.last_name}`,
        teamName: `${row.teams.age_group} ${row.teams.name}`,
        ageGroup: row.teams.age_group,
        dateDelivered: row.delivery_date,
        lessonVersion: row.lessons.version || 1,
        notes: row.notes,
      }));
    } catch (error) {
      console.error('Error fetching lesson deliveries:', error);
      throw new Error('Failed to load lesson deliveries. Please try again.');
    }
  }

  /**
   * Fetch coach activity summary with filters
   */
  async getCoachActivity(filters: ReportFilters): Promise<CoachActivityRow[]> {
    try {
      // This is a complex query - we'll fetch data and aggregate in JS
      // In production, consider creating a database view for better performance
      
      const { data: coaches, error: coachesError } = await this.supabase
        .from('users')
        .select('id, first_name, last_name')
        .in('role', ['coach', 'manager', 'admin']);

      if (coachesError) throw coachesError;

      const results: CoachActivityRow[] = [];

      for (const coach of coaches || []) {
        // Count lesson deliveries
        let deliveriesQuery = this.supabase
          .from('lesson_deliveries')
          .select('id, delivery_date', { count: 'exact', head: false })
          .eq('coach_id', coach.id);

        if (filters.dateFrom) {
          deliveriesQuery = deliveriesQuery.gte('delivery_date', filters.dateFrom);
        }
        if (filters.dateTo) {
          deliveriesQuery = deliveriesQuery.lte('delivery_date', filters.dateTo);
        }

        const { data: deliveries, error: deliveriesError } = await deliveriesQuery;
        if (deliveriesError) throw deliveriesError;

        // Count game feedback
        let feedbackQuery = this.supabase
          .from('game_feedback')
          .select('id, created_at', { count: 'exact', head: false })
          .eq('created_by', coach.id);

        if (filters.dateFrom) {
          feedbackQuery = feedbackQuery.gte('created_at', filters.dateFrom);
        }
        if (filters.dateTo) {
          feedbackQuery = feedbackQuery.lte('created_at', filters.dateTo);
        }

        const { data: feedback, error: feedbackError } = await feedbackQuery;
        if (feedbackError) throw feedbackError;

        // Get teams coached
        const { data: teamMembers, error: teamMembersError } = await this.supabase
          .from('team_members')
          .select('teams(name, age_group)')
          .eq('user_id', coach.id)
          .in('role', ['coach', 'manager']);

        if (teamMembersError) throw teamMembersError;

        const teamsCoached = (teamMembers || [])
          .map((tm: any) => `${tm.teams.age_group} ${tm.teams.name}`)
          .filter((name, index, self) => self.indexOf(name) === index); // unique

        // Find last activity date
        const deliveryDates = (deliveries || []).map((d: any) => new Date(d.delivery_date));
        const feedbackDates = (feedback || []).map((f: any) => new Date(f.created_at));
        const allDates = [...deliveryDates, ...feedbackDates];
        const lastActivityDate = allDates.length > 0 
          ? new Date(Math.max(...allDates.map(d => d.getTime()))).toISOString()
          : null;

        results.push({
          coachId: coach.id,
          coachName: `${coach.first_name} ${coach.last_name}`,
          lessonsDelivered: deliveries?.length || 0,
          gameFeedbackCount: feedback?.length || 0,
          lastActivityDate,
          teamsCoached,
        });
      }

      // Sort by lessons delivered descending
      return results.sort((a, b) => b.lessonsDelivered - a.lessonsDelivered);
    } catch (error) {
      console.error('Error fetching coach activity:', error);
      throw new Error('Failed to load coach activity. Please try again.');
    }
  }

  /**
   * Fetch team training history with filters
   */
  async getTeamTraining(filters: ReportFilters): Promise<TeamTrainingRow[]> {
    try {
      let query = this.supabase
        .from('lesson_deliveries')
        .select(`
          delivery_date,
          lessons!inner(title, skill_category, version),
          teams!inner(name, age_group),
          users!inner(first_name, last_name)
        `)
        .order('delivery_date', { ascending: false })
        .limit(100);

      // Apply filters
      if (filters.teamId) {
        query = query.eq('team_id', filters.teamId);
      }
      if (filters.ageGroup) {
        query = query.eq('teams.age_group', filters.ageGroup);
      }
      if (filters.dateFrom) {
        query = query.gte('delivery_date', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('delivery_date', filters.dateTo);
      }
      if (filters.skillCategory) {
        query = query.eq('lessons.skill_category', filters.skillCategory);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Transform to TeamTrainingRow format
      return (data || []).map((row: any) => ({
        teamName: `${row.teams.age_group} ${row.teams.name}`,
        ageGroup: row.teams.age_group,
        lessonName: row.lessons.title,
        skillCategory: row.lessons.skill_category,
        dateDelivered: row.delivery_date,
        coachName: `${row.users.first_name} ${row.users.last_name}`,
        lessonVersion: row.lessons.version || 1,
      }));
    } catch (error) {
      console.error('Error fetching team training:', error);
      throw new Error('Failed to load team training history. Please try again.');
    }
  }

  /**
   * Fetch filter options (teams, coaches, skill categories)
   */
  async getFilterOptions(): Promise<FilterOptions> {
    try {
      // Fetch teams
      const { data: teams, error: teamsError } = await this.supabase
        .from('teams')
        .select('id, name, age_group')
        .order('age_group')
        .order('name');

      if (teamsError) throw teamsError;

      // Fetch coaches
      const { data: coaches, error: coachesError } = await this.supabase
        .from('users')
        .select('id, first_name, last_name')
        .in('role', ['coach', 'manager', 'admin'])
        .order('first_name');

      if (coachesError) throw coachesError;

      // Fetch skill categories (from lessons table)
      const { data: lessons, error: lessonsError } = await this.supabase
        .from('lessons')
        .select('skill_category');

      if (lessonsError) throw lessonsError;

      // Get unique skill categories
      const skillCategories = [...new Set((lessons || []).map((l: any) => l.skill_category))].sort();

      return {
        teams: (teams || []).map(t => ({
          id: t.id,
          name: `${t.age_group} ${t.name}`,
          ageGroup: t.age_group,
        })),
        coaches: (coaches || []).map(c => ({
          id: c.id,
          name: `${c.first_name} ${c.last_name}`,
        })),
        skillCategories,
      };
    } catch (error) {
      console.error('Error fetching filter options:', error);
      throw new Error('Failed to load filter options. Please try again.');
    }
  }

  // ============================================================================
  // Phase 2: Feedback Analysis Methods
  // ============================================================================

  /**
   * Fetch lesson effectiveness data with ratings
   */
  async getLessonEffectiveness(filters: ReportFilters): Promise<LessonEffectivenessRow[]> {
    try {
      // Get all lessons
      let lessonsQuery = this.supabase
        .from('lessons')
        .select('id, title, skill_category, age_group');

      if (filters.ageGroup) {
        lessonsQuery = lessonsQuery.eq('age_group', filters.ageGroup);
      }
      if (filters.skillCategory) {
        lessonsQuery = lessonsQuery.eq('skill_category', filters.skillCategory);
      }

      const { data: lessons, error: lessonsError } = await lessonsQuery;
      if (lessonsError) throw lessonsError;

      const results: LessonEffectivenessRow[] = [];

      for (const lesson of lessons || []) {
        // Count deliveries
        let deliveriesQuery = this.supabase
          .from('lesson_deliveries')
          .select('id', { count: 'exact', head: true })
          .eq('lesson_id', lesson.id);

        if (filters.dateFrom) {
          deliveriesQuery = deliveriesQuery.gte('delivery_date', filters.dateFrom);
        }
        if (filters.dateTo) {
          deliveriesQuery = deliveriesQuery.lte('delivery_date', filters.dateTo);
        }

        const { count: deliveryCount, error: deliveriesError } = await deliveriesQuery;
        if (deliveriesError) throw deliveriesError;

        // Skip if below minimum deliveries
        if (filters.minDeliveries && (deliveryCount || 0) < filters.minDeliveries) {
          continue;
        }

        // Get feedback with ratings
        let feedbackQuery = this.supabase
          .from('lesson_feedback')
          .select('rating')
          .eq('lesson_id', lesson.id);

        if (filters.dateFrom) {
          feedbackQuery = feedbackQuery.gte('created_at', filters.dateFrom);
        }
        if (filters.dateTo) {
          feedbackQuery = feedbackQuery.lte('created_at', filters.dateTo);
        }

        const { data: feedback, error: feedbackError } = await feedbackQuery;
        if (feedbackError) throw feedbackError;

        const feedbackCount = feedback?.length || 0;
        const averageRating = feedbackCount > 0
          ? feedback!.reduce((sum, f) => sum + (f.rating || 0), 0) / feedbackCount
          : null;

        results.push({
          lessonId: lesson.id,
          lessonName: lesson.title,
          skillCategory: lesson.skill_category,
          ageGroup: lesson.age_group || 'All',
          deliveryCount: deliveryCount || 0,
          feedbackCount,
          averageRating,
        });
      }

      // Sort by average rating descending (nulls last)
      return results.sort((a, b) => {
        if (a.averageRating === null && b.averageRating === null) return 0;
        if (a.averageRating === null) return 1;
        if (b.averageRating === null) return -1;
        return b.averageRating - a.averageRating;
      });
    } catch (error) {
      console.error('Error fetching lesson effectiveness:', error);
      throw new Error('Failed to load lesson effectiveness. Please try again.');
    }
  }

  /**
   * Fetch session ratings data
   */
  async getSessionRatings(filters: ReportFilters): Promise<SessionRatingsRow[]> {
    try {
      // Get all sessions
      let sessionsQuery = this.supabase
        .from('sessions')
        .select('id, title, session_type, skill_category');

      if (filters.skillCategory) {
        sessionsQuery = sessionsQuery.eq('skill_category', filters.skillCategory);
      }

      const { data: sessions, error: sessionsError } = await sessionsQuery;
      if (sessionsError) throw sessionsError;

      const results: SessionRatingsRow[] = [];

      for (const session of sessions || []) {
        // Get feedback with ratings
        let feedbackQuery = this.supabase
          .from('session_feedback')
          .select('rating')
          .eq('session_id', session.id);

        if (filters.dateFrom) {
          feedbackQuery = feedbackQuery.gte('created_at', filters.dateFrom);
        }
        if (filters.dateTo) {
          feedbackQuery = feedbackQuery.lte('created_at', filters.dateTo);
        }

        const { data: feedback, error: feedbackError } = await feedbackQuery;
        if (feedbackError) throw feedbackError;

        const feedbackCount = feedback?.length || 0;
        const averageRating = feedbackCount > 0
          ? feedback!.reduce((sum, f) => sum + (f.rating || 0), 0) / feedbackCount
          : null;

        // Count how many times session was used in lessons
        const { count: deliveryCount, error: deliveryError } = await this.supabase
          .from('lesson_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('session_id', session.id);

        if (deliveryError) throw deliveryError;

        results.push({
          sessionId: session.id,
          sessionName: session.title,
          sessionType: session.session_type || 'Unknown',
          skillCategory: session.skill_category || 'Unknown',
          deliveryCount: deliveryCount || 0,
          feedbackCount,
          averageRating,
        });
      }

      // Sort by average rating descending (nulls last)
      return results.sort((a, b) => {
        if (a.averageRating === null && b.averageRating === null) return 0;
        if (a.averageRating === null) return 1;
        if (b.averageRating === null) return -1;
        return b.averageRating - a.averageRating;
      });
    } catch (error) {
      console.error('Error fetching session ratings:', error);
      throw new Error('Failed to load session ratings. Please try again.');
    }
  }

  /**
   * Fetch game feedback data.
   *
   * Reads the LIVE game_feedback schema (migrations 022/025/069): free-text
   * feedback per team or per player, with `game_id` referencing `events.id`
   * (games are events, per project standards) rather than its own date/
   * opponent columns. Joins `events` for those fields instead of selecting
   * columns (attacking_www, etc.) that were dropped in 2026-08 — see the
   * GameFeedbackRow doc comment for the bug this replaces.
   */
  async getGameFeedback(filters: ReportFilters): Promise<GameFeedbackRow[]> {
    try {
      let query = this.supabase
        .from('game_feedback')
        .select(`
          id,
          feedback_type,
          feedback_text,
          phase_tags,
          events!inner(event_date, opponent),
          teams!inner(name, age_group),
          users!created_by(first_name, last_name),
          player:users!player_id(first_name, last_name)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (filters.dateFrom) {
        query = query.gte('events.event_date', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('events.event_date', filters.dateTo);
      }
      if (filters.teamId) {
        query = query.eq('team_id', filters.teamId);
      }
      if (filters.coachId) {
        query = query.eq('created_by', filters.coachId);
      }
      if (filters.ageGroup) {
        query = query.eq('teams.age_group', filters.ageGroup);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((row: any) => ({
        id: row.id,
        teamName: `${row.teams.age_group} ${row.teams.name}`,
        ageGroup: row.teams.age_group,
        gameDate: row.events.event_date,
        opponent: row.events.opponent,
        coachName: `${row.users.first_name} ${row.users.last_name}`,
        feedbackType: row.feedback_type,
        playerName: row.player ? `${row.player.first_name} ${row.player.last_name}` : null,
        feedbackText: row.feedback_text,
        phaseTags: row.phase_tags || [],
      }));
    } catch (error) {
      console.error('Error fetching game feedback:', error);
      throw new Error('Failed to load game feedback. Please try again.');
    }
  }

  /**
   * Fetch detailed feedback for a specific lesson
   */
  async getLessonFeedbackDetails(lessonId: string): Promise<FeedbackDetail[]> {
    try {
      const { data, error } = await this.supabase
        .from('lesson_feedback')
        .select(`
          id,
          rating,
          comment,
          created_at,
          users!inner(first_name, last_name),
          lesson_deliveries!inner(teams!inner(name, age_group))
        `)
        .eq('lesson_id', lessonId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((row: any) => ({
        id: row.id,
        rating: row.rating,
        comment: row.comment,
        coachName: `${row.users.first_name} ${row.users.last_name}`,
        teamName: `${row.lesson_deliveries.teams.age_group} ${row.lesson_deliveries.teams.name}`,
        date: row.created_at,
      }));
    } catch (error) {
      console.error('Error fetching lesson feedback details:', error);
      throw new Error('Failed to load feedback details. Please try again.');
    }
  }

  /**
   * Fetch detailed feedback for a specific session
   */
  async getSessionFeedbackDetails(sessionId: string): Promise<FeedbackDetail[]> {
    try {
      const { data, error } = await this.supabase
        .from('session_feedback')
        .select(`
          id,
          rating,
          comment,
          created_at,
          users!inner(first_name, last_name),
          teams!inner(name, age_group)
        `)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((row: any) => ({
        id: row.id,
        rating: row.rating,
        comment: row.comment,
        coachName: `${row.users.first_name} ${row.users.last_name}`,
        teamName: row.teams ? `${row.teams.age_group} ${row.teams.name}` : 'Unknown',
        date: row.created_at,
      }));
    } catch (error) {
      console.error('Error fetching session feedback details:', error);
      throw new Error('Failed to load feedback details. Please try again.');
    }
  }
}

// Export singleton instance
export const reportingApi = new ReportingApi();
