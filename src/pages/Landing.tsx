import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { Bell, TrendingUp, Users, Calendar, BookOpen, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { teamsApi } from '../lib/teams-api';
import { UserRole } from '../types/database';

interface Announcement {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  is_ongoing: boolean;
  expires_at: string | null;
  target_roles: string[] | null;
  target_team_types: string[] | null;
  target_divisions: string[] | null;
  target_age_groups: string[] | null;
  target_team_ids: string[] | null;
  created_at: string;
}

interface Team {
  id: string;
  name: string;
  age_group: string;
  division: string;
}

export function Landing() {
  const { user } = useAuth();
  const { hasFullVersion } = usePermissions();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [userTeams, setUserTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    users: 0,
    teams: 0,
  });
  // Isolated error flag for the "Teams" stat only (Req 7.7) so a failed
  // team-membership query never affects the other stats.
  const [teamsError, setTeamsError] = useState(false);

  useEffect(() => {
    fetchUserTeams();
    fetchStats();
  }, [user]);

  useEffect(() => {
    if (userTeams.length > 0 || user) {
      fetchAnnouncements();
    }
  }, [userTeams, user]);

  const fetchUserTeams = async () => {
    if (!user) return;

    try {
      // Fetch teams where user is coach
      const { data, error } = await supabase
        .from('teams')
        .select('id, name, age_group, division')
        .eq('coach_id', user.id);

      if (error) throw error;
      setUserTeams(data || []);
    } catch (error) {
      console.error('Error fetching user teams:', error);
    }
  };

  const fetchStats = async () => {
    if (!user) return;

    // Users count — independent of the Teams stat so a failure here or there
    // never affects the other (Req 7.7).
    try {
      const { count: usersCount, error: usersError } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true });

      if (usersError) throw usersError;

      setStats((prev) => ({ ...prev, users: usersCount || 0 }));
    } catch (error) {
      console.error('Error fetching users count:', error);
    }

    // Teams count. Player-role users get their personal count derived from
    // team_members (Req 7.1-7.3, 7.5) rather than a club-wide `teams` count that
    // RLS zeroes for players. Admins may still see the club-wide count (Req 7.6).
    try {
      setTeamsError(false);

      if (user.role === UserRole.ADMIN) {
        const { count: teamsCount, error: teamsCountError } = await supabase
          .from('teams')
          .select('*', { count: 'exact', head: true });

        if (teamsCountError) throw teamsCountError;

        setStats((prev) => ({ ...prev, teams: teamsCount || 0 }));
      } else {
        const teamCount = await teamsApi.getMyTeamCount(user.id);
        setStats((prev) => ({ ...prev, teams: teamCount }));
      }
    } catch (error) {
      console.error('Error fetching teams count:', error);
      // Show an error indicator for the Teams stat only, leaving other stats
      // unaffected, rather than a misleading number (Req 7.7).
      setTeamsError(true);
    }
  };

  const fetchAnnouncements = async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      
      // Fetch active announcements (not expired)
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .or(`is_ongoing.eq.true,expires_at.gt.${now}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Filter announcements based on targeting
      const filtered = (data || []).filter((announcement) => {
        // Check role targeting
        if (announcement.target_roles && announcement.target_roles.length > 0) {
          if (!announcement.target_roles.includes(user.role)) {
            return false;
          }
        }

        // Check team-based targeting (only if user has teams)
        if (userTeams.length > 0) {
          // Check division targeting
          if (announcement.target_divisions && announcement.target_divisions.length > 0) {
            const userDivisions = userTeams.map(t => t.division);
            if (!announcement.target_divisions.some(d => userDivisions.includes(d))) {
              return false;
            }
          }

          // Check age group targeting
          if (announcement.target_age_groups && announcement.target_age_groups.length > 0) {
            const userAgeGroups = userTeams.map(t => t.age_group);
            if (!announcement.target_age_groups.some(ag => userAgeGroups.includes(ag))) {
              return false;
            }
          }

          // Check specific team targeting
          if (announcement.target_team_ids && announcement.target_team_ids.length > 0) {
            const userTeamIds = userTeams.map(t => t.id);
            if (!announcement.target_team_ids.some(tid => userTeamIds.includes(tid))) {
              return false;
            }
          }
        }

        return true;
      });

      setAnnouncements(filtered);
    } catch (error) {
      console.error('Error fetching announcements:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="px-4 py-6 pb-20">
      {/* Welcome Header */}
      <div className="mb-6 border-l-8 border-[#0091f3] pl-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Welcome back, {user?.first_name}! 👋
        </h1>
        <p className="text-gray-600">
          {user?.role.charAt(0).toUpperCase()}{user?.role.slice(1)}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#0091f3] flex items-center justify-center mb-2">
            <Users className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mb-0.5">{stats.users}</p>
          <p className="text-xs text-gray-600">Users</p>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="w-10 h-10 rounded-xl bg-orange-100 text-[#ea7800] flex items-center justify-center mb-2">
            <TrendingUp className="w-5 h-5" />
          </div>
          {teamsError ? (
            <p
              className="text-2xl font-bold text-red-500 mb-0.5"
              title="Couldn't load your teams"
            >
              !
            </p>
          ) : (
            <p className="text-2xl font-bold text-gray-900 mb-0.5">{stats.teams}</p>
          )}
          <p className="text-xs text-gray-600">Teams</p>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="w-10 h-10 rounded-xl bg-gray-100 text-[#545859] flex items-center justify-center mb-2">
            <Calendar className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mb-0.5">?</p>
          <p className="text-xs text-gray-600">Coming Soon</p>
        </div>
      </div>

      {/* Quick links — Resources lives here (second-level off Home) rather than
          occupying a bottom-nav tab. Available to every role. */}
      <div className="mb-6">
        <Link
          to="/resources"
          className="flex items-center gap-3 bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#0091f3] flex items-center justify-center">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-sm">Resources</p>
            <p className="text-xs text-gray-600">Guides, documents and downloads</p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
        </Link>
      </div>

      {/* Announcements */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center space-x-2">
            <Bell className="w-5 h-5 text-[#0091f3]" />
            <h3 className="font-semibold text-gray-900">Announcements</h3>
          </div>
        </div>
        {isLoading ? (
          <div className="px-4 py-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0091f3] mx-auto"></div>
          </div>
        ) : announcements.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {announcements.map((announcement) => (
              <div key={announcement.id} className="px-4 py-4">
                {announcement.image_url && (
                  <img 
                    src={announcement.image_url} 
                    alt="" 
                    className="w-full h-32 object-cover rounded-lg mb-3"
                  />
                )}
                <h1 className="font-bold text-gray-900 text-2xl mb-2">
                  {announcement.title}
                  {announcement.is_ongoing && (
                    <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full ml-2 align-middle">
                      Ongoing
                    </span>
                  )}
                </h1>
                <div 
                  className="announcement-content text-sm mb-2"
                  dangerouslySetInnerHTML={{ __html: announcement.content }}
                />
                <style>{`
                  .announcement-content {
                    line-height: 1.6;
                    color: #4b5563;
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                  }
                  .announcement-content h2 {
                    font-size: 18px !important;
                    font-weight: 600 !important;
                    color: #111827 !important;
                    margin-top: 1rem !important;
                    margin-bottom: 0.5rem !important;
                    font-family: 'Exo 2', sans-serif !important;
                  }
                  .announcement-content h3 {
                    font-size: 16px !important;
                    font-weight: 600 !important;
                    color: #111827 !important;
                    margin-top: 0.75rem !important;
                    margin-bottom: 0.5rem !important;
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
                  }
                  .announcement-content p {
                    margin-bottom: 0.5rem;
                    font-size: 14px;
                  }
                  .announcement-content ul, .announcement-content ol {
                    margin-left: 1.5rem;
                    margin-bottom: 0.5rem;
                    font-size: 14px;
                  }
                  .announcement-content strong {
                    font-weight: 600;
                    color: #111827;
                  }
                  .announcement-content em {
                    font-style: italic;
                  }
                `}</style>
                <span className="text-xs text-gray-500">
                  {new Date(announcement.created_at).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-gray-500">
            <Bell className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No announcements at this time</p>
          </div>
        )}
      </div>
    </div>
  );
}
