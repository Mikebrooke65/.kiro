import { Link, useNavigate } from 'react-router';
import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { teamsApi } from '../lib/teams-api';
import type { Team as DbTeam } from '../types/database';

interface Team {
  id: string;
  name: string;
  age_group: string;
  division?: string;
}

interface Lesson {
  id: string;
  title: string;
  skill_category: string;
  age_group: string;
  delivery_date?: string;
}

export function Coaching() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [pastLessons, setPastLessons] = useState<Lesson[]>([]);
  const [availableLessons, setAvailableLessons] = useState<Lesson[]>([]);

  const handleLessonClick = (lessonId: string) => {
    if (selectedLessonId === lessonId) {
      // Second click - navigate to lesson detail with team context
      navigate(`/lessons/${lessonId}`, { state: { teamId: selectedTeam?.id } });
    } else {
      // First click - select the lesson
      setSelectedLessonId(lessonId);
    }
  };

  useEffect(() => {
    fetchUserTeams();
  }, [user]);

  useEffect(() => {
    if (selectedTeam) {
      fetchLessons();
    }
  }, [selectedTeam]);

  const fetchUserTeams = async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      // Read team data through the team_members -> teams join keyed on the
      // current user so the result equals the user's membership and isn't
      // reduced to zero by the `teams` SELECT policy for players (Req 7.4).
      const memberships = await teamsApi.getMyTeams(user.id);

      // Dedupe by team id: getMyTeams returns one row PER relationship, so a
      // user who is a coach on a team AND a caregiver of a child on the same
      // team gets it back more than once — which showed the team duplicated
      // in this dropdown (found live 2026-09-03; the Team page already
      // dedupes via buildTeamSelection, this page didn't).
      const seenTeamIds = new Set<string>();
      const userTeams: Team[] = memberships
        .map((tm) => tm.team)
        .filter((team): team is DbTeam => Boolean(team))
        .filter((team) => {
          if (seenTeamIds.has(team.id)) return false;
          seenTeamIds.add(team.id);
          return true;
        })
        .map((team) => ({
          id: team.id,
          name: team.name,
          age_group: team.age_group,
          division: team.division,
        }))
        .sort((a, b) => a.age_group.localeCompare(b.age_group));

      setTeams(userTeams);
      // Set first team as selected by default
      if (userTeams.length > 0) {
        setSelectedTeam(userTeams[0]);
      }
    } catch (error) {
      console.error('Error fetching teams:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLessons = async () => {
    if (!selectedTeam) return;

    try {
      // Fetch past lessons (delivered to this team)
      const { data: pastData, error: pastError } = await supabase
        .from('lesson_deliveries')
        .select(`
          id,
          delivery_date,
          lesson:lessons (
            id,
            title,
            skill_category,
            age_group
          )
        `)
        .eq('team_id', selectedTeam.id)
        .order('delivery_date', { ascending: false });

      if (pastError) throw pastError;

      // Transform the data
      const past = (pastData || []).map((delivery: any) => ({
        id: delivery.lesson.id,
        title: delivery.lesson.title,
        skill_category: delivery.lesson.skill_category,
        age_group: delivery.lesson.age_group,
        delivery_date: delivery.delivery_date,
      }));

      setPastLessons(past);

      // Fetch allocated lessons for this age group
      const { data: allocationsData, error: allocationsError } = await supabase
        .from('lesson_allocations')
        .select('lesson_id')
        .eq('age_group', selectedTeam.age_group);

      if (allocationsError) throw allocationsError;

      const allocatedLessonIds = (allocationsData || []).map(a => a.lesson_id);

      // Fetch available lessons (not yet delivered, matching division, AND allocated to this age group)
      const deliveredLessonIds = past.map(l => l.id);
      
      // If no lessons are allocated to this age group, show none
      if (allocatedLessonIds.length === 0) {
        setAvailableLessons([]);
        return;
      }

      let query = supabase
        .from('lessons')
        .select('id, title, skill_category, age_group, division')
        .in('id', allocatedLessonIds)
        .order('skill_category')
        .order('title');

      // Filter by team's division if it exists
      if (selectedTeam.division) {
        query = query.eq('division', selectedTeam.division);
      }

      // Exclude already delivered lessons
      if (deliveredLessonIds.length > 0) {
        query = query.not('id', 'in', `(${deliveredLessonIds.join(',')})`);
      }

      const { data: availableData, error: availableError } = await query;

      if (availableError) throw availableError;

      setAvailableLessons(availableData || []);
    } catch (error) {
      console.error('Error fetching lessons:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-gray-50 min-h-full pb-20 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#22c55e]"></div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-full pb-20">
      {/* Header */}
      <div className="p-4">
        <div className="border-l-8 border-[#22c55e] pl-4 mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Coaching</h1>
          <p className="text-gray-600 text-sm">
            Access lessons, AI coaching assistant, and training resources
          </p>
        </div>
      </div>

      {/* Team Selection Block */}
      {teams.length > 0 ? (
        <div className="px-4 mb-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-visible">
            <div className="p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-lg text-gray-900">
                  Team {selectedTeam?.age_group} {selectedTeam?.name}
                </h2>
                {teams.length > 1 && (
                  <div className="relative">
                    <button
                      onClick={() => setShowTeamDropdown(!showTeamDropdown)}
                      className="flex items-center gap-2 px-4 py-2 bg-[#0091f3] text-white rounded-lg text-sm font-medium hover:bg-[#0081d8] transition-colors"
                    >
                      Change Team
                      <ChevronDown className={`w-4 h-4 transition-transform ${showTeamDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    {showTeamDropdown && (
                      <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
                        {teams.map((team) => (
                          <button
                            key={team.id}
                            className={`block w-full text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                              team.id === selectedTeam?.id ? 'bg-blue-50 text-[#0091f3] font-medium' : 'text-gray-700'
                            }`}
                            onClick={() => {
                              setSelectedTeam(team);
                              setShowTeamDropdown(false);
                            }}
                          >
                            {team.age_group} {team.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-4 mb-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              You are not assigned to any teams yet. Contact an administrator to be assigned to a team.
            </p>
          </div>
        </div>
      )}

      {/* Coaching Options */}
      <div className="p-4 space-y-4">
        {/* Past Lessons Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-2.5" style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)' }}>
            <h3 className="font-semibold text-gray-900 text-sm">Past Lessons</h3>
          </div>
          {pastLessons.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {pastLessons.map((lesson) => {
                const skillColors: Record<string, string> = {
                  'Shooting': '#ea7800',
                  'Passing': '#0091f3',
                  'Attacking': '#22c55e',
                  'Defending': '#545859',
                  'Technical': '#8b5cf6',
                };
                const color = skillColors[lesson.skill_category] || '#0091f3';
                
                return (
                  <div key={lesson.id} className="px-4 py-2 hover:bg-gray-50 transition-colors cursor-pointer">
                    <p className="text-sm font-medium text-gray-900 truncate">{lesson.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500">
                        {lesson.delivery_date ? new Date(lesson.delivery_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date'}
                      </span>
                      <span 
                        className="px-2 py-0 text-[10px] font-medium rounded-full text-white"
                        style={{ backgroundColor: color }}
                      >
                        {lesson.skill_category}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-center text-gray-500">
              <p className="text-sm">No lessons delivered yet</p>
            </div>
          )}
        </div>

        {/* Next Lesson Selection */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-2.5" style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)' }}>
            <h3 className="font-semibold text-gray-900 text-sm">Next Lesson</h3>
            <p className="text-xs text-gray-600">Select a lesson to deliver</p>
          </div>
          {availableLessons.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {availableLessons.map((lesson) => {
                const skillColors: Record<string, string> = {
                  'Shooting': '#ea7800',
                  'Passing': '#0091f3',
                  'Attacking': '#22c55e',
                  'Defending': '#545859',
                  'Technical': '#8b5cf6',
                };
                const color = skillColors[lesson.skill_category] || '#0091f3';
                
                return (
                  <div 
                    key={lesson.id} 
                    className="px-4 py-2 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => handleLessonClick(lesson.id)}
                  >
                    <p className="text-sm font-medium text-gray-900 truncate">{lesson.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        selectedLessonId === lesson.id 
                          ? 'bg-[#0091f3] border-[#0091f3]' 
                          : 'border-gray-300'
                      }`}>
                        {selectedLessonId === lesson.id && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span 
                        className="px-2 py-0 text-[10px] font-medium rounded-full text-white"
                        style={{ backgroundColor: color }}
                      >
                        {lesson.skill_category}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-center text-gray-500">
              <p className="text-sm">No available lessons for {selectedTeam?.age_group}</p>
              <p className="text-xs mt-1">All lessons have been delivered to this team</p>
            </div>
          )}
        </div>

        {/* Progress Notes entry point (internal name "Gant") — Requirement
            1.1/1.3, 12.8: the user-facing name is "Progress Notes"; "Gant"
            is never shown here or anywhere player/caregiver-facing. */}
        <Link
          to="/ai-coach"
          className="block text-white rounded-lg shadow hover:shadow-md transition-shadow p-4"
          style={{ backgroundColor: '#d97706' }}
        >
          <div className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
              />
            </svg>
            <span className="font-semibold">Progress Notes</span>
          </div>
        </Link>
      </div>
    </div>
  );
}
