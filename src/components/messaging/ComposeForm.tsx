import React, { useState, useEffect, useMemo } from 'react';
import { Send, X, Search, ChevronDown, User, Users, Shield, Crown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useMessaging } from '../../contexts/MessagingContext';
import { TargetingSelector, type TargetingData } from '../shared/TargetingSelector';
import type { MessageTargetingType, CreateMessagePayload } from '../../types/database';

interface TeamMemberOption {
  user_id: string;
  first_name: string;
  last_name: string;
  role: string;
}

export interface ComposeFormProps {
  prefillTitle?: string;
  prefillBody?: string;
  prefillTeamId?: string;
  prefillTargeting?: MessageTargetingType;
  hideTargetingOptions?: boolean;
  enableEnhancedTargeting?: boolean; // New prop for desktop enhanced targeting
  onClose?: () => void;
  onSent?: () => void;
}

const TARGETING_OPTIONS: { value: MessageTargetingType; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'individual', label: 'Individual', icon: <User className="w-4 h-4" />, description: 'Send to one person' },
  { value: 'whole_team', label: 'Whole Team', icon: <Users className="w-4 h-4" />, description: 'All team members' },
  { value: 'management_team', label: 'Management', icon: <Shield className="w-4 h-4" />, description: 'Coaches & managers' },
  { value: 'club_admin', label: 'Club Admin', icon: <Crown className="w-4 h-4" />, description: 'All admins' },
];

export function ComposeForm({
  prefillTitle = '',
  prefillBody = '',
  prefillTeamId,
  prefillTargeting,
  hideTargetingOptions = false,
  enableEnhancedTargeting = false,
  onClose,
  onSent,
}: ComposeFormProps) {
  const { user } = useAuth();
  const { sendMessage } = useMessaging();

  // Form state
  const [targetingType, setTargetingType] = useState<MessageTargetingType | null>(prefillTargeting || null);
  const [selectedTeamId, setSelectedTeamId] = useState<string>(prefillTeamId || '');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [title, setTitle] = useState(prefillTitle);
  const [body, setBody] = useState(prefillBody);

  // Validation errors
  const [errors, setErrors] = useState<{ targeting?: string; title?: string; body?: string }>({});
  // Send state
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Individual user search
  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  // Derive teams from team_members (source of truth)
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('team_members')
      .select('team_id, teams!inner(name, age_group)')
      .eq('user_id', user.id)
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to fetch teams for compose:', error);
          return;
        }
        const t = (data || []).map((row: any) => ({
          id: row.team_id,
          name: `${row.teams.age_group} ${row.teams.name}`,
        }));
        setTeams(t);
        if (prefillTeamId) {
          setSelectedTeamId(prefillTeamId);
        } else if (t.length === 1) {
          setSelectedTeamId(t[0].id);
        }
      });
  }, [user?.id, prefillTeamId]);

  // Fetch team members when individual targeting is selected and team is chosen
  useEffect(() => {
    if (targetingType !== 'individual' || !selectedTeamId) {
      setTeamMembers([]);
      return;
    }

    let cancelled = false;
    setIsLoadingMembers(true);
    // Auto-show the dropdown when members load
    setShowUserDropdown(true);

    async function fetchMembers() {
      try {
        const { data, error } = await supabase
          .from('team_members')
          .select('user_id, users!inner(first_name, last_name, role)')
          .eq('team_id', selectedTeamId);

        if (error) throw error;
        if (cancelled) return;

        const members: TeamMemberOption[] = (data ?? []).map((row: any) => ({
          user_id: row.user_id,
          first_name: row.users.first_name,
          last_name: row.users.last_name,
          role: row.users.role,
        }));

        if (!cancelled) {
          // Exclude current user from the list
          setTeamMembers(members.filter((m) => m.user_id !== user?.id));
        }
      } catch (err) {
        console.error('Failed to fetch team members:', err);
      } finally {
        if (!cancelled) setIsLoadingMembers(false);
      }
    }

    fetchMembers();
    return () => { cancelled = true; };
  }, [targetingType, selectedTeamId, user?.id]);

  // Filtered members based on search
  const filteredMembers = useMemo(() => {
    if (!userSearch.trim()) return teamMembers;
    const q = userSearch.toLowerCase();
    return teamMembers.filter(
      (m) =>
        m.first_name.toLowerCase().includes(q) ||
        m.last_name.toLowerCase().includes(q)
    );
  }, [teamMembers, userSearch]);

  // Selected user display name
  const selectedUserName = useMemo(() => {
    const member = teamMembers.find((m) => m.user_id === selectedUserId);
    return member ? `${member.first_name} ${member.last_name}` : '';
  }, [teamMembers, selectedUserId]);

  // Validation
  function validate(): boolean {
    const newErrors: typeof errors = {};

    if (!targetingType) {
      newErrors.targeting = 'Please select recipients';
    } else if (targetingType === 'individual' && !selectedUserId) {
      newErrors.targeting = 'Please select recipients';
    }

    if (!title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (!body.trim()) {
      newErrors.body = 'Message body is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  // Handle send
  async function handleSend() {
    setSendError(null);
    if (!validate()) return;

    setIsSending(true);
    try {
      const payload: CreateMessagePayload = {
        // A "Club Admin" message is team-less (migration 075) — the team
        // selector is hidden for it, so never send a stale/empty team id.
        team_id: targetingType === 'club_admin' ? null : selectedTeamId,
        targeting_type: targetingType!,
        title: title.trim(),
        body: body.trim(),
      };

      if (targetingType === 'individual') {
        payload.individual_user_id = selectedUserId;
      }

      await sendMessage(payload);

      // Success — clear form and notify
      setTargetingType(null);
      setSelectedUserId('');
      setTitle('');
      setBody('');
      setErrors({});
      onSent?.();
    } catch (err: any) {
      // Retain form data for retry
      setSendError(err?.message || 'Message failed to send. Check your connection and try again.');
    } finally {
      setIsSending(false);
    }
  }

  // Clear error when user changes a field
  function clearFieldError(field: keyof typeof errors) {
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 rounded-t-lg"
        style={{ backgroundColor: '#545859' }}
      >
        <h2 className="text-white font-semibold text-lg">New Message</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
            aria-label="Close compose form"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {/* Targeting type selector */}
        {!hideTargetingOptions && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Send to</label>
            <div className="grid grid-cols-2 gap-1.5">
              {TARGETING_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setTargetingType(opt.value);
                    setSelectedUserId('');
                    clearFieldError('targeting');
                  }}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-sm transition-colors ${
                    targetingType === opt.value
                      ? 'border-[#545859] bg-[#545859]/10 text-gray-900'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                  aria-pressed={targetingType === opt.value}
                >
                  {opt.icon}
                  <span className="font-medium">{opt.label}</span>
                </button>
              ))}
            </div>
            {errors.targeting && (
              <p className="mt-1 text-sm text-red-600" role="alert">{errors.targeting}</p>
            )}
          </div>
        )}

        {/* Team selector — show when user has multiple teams and targeting is not club_admin */}
        {teams.length > 1 && targetingType && targetingType !== 'club_admin' && (
          <div>
            <label htmlFor="team-select" className="block text-sm font-medium text-gray-700 mb-1">
              Team
            </label>
            <div className="relative">
              <select
                id="team-select"
                value={selectedTeamId}
                onChange={(e) => {
                  setSelectedTeamId(e.target.value);
                  setSelectedUserId('');
                }}
                className="w-full appearance-none rounded-lg border border-gray-200 px-3 py-2 pr-8 text-sm text-gray-900 focus:border-[#545859] focus:ring-1 focus:ring-[#545859] outline-none"
              >
                <option value="">Select a team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        )}

        {/* Individual user search */}
        {targetingType === 'individual' && selectedTeamId && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Recipient</label>
            <div className="relative">
              {selectedUserId ? (
                <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                  <span className="text-sm text-gray-900">{selectedUserName}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUserId('');
                      setShowUserDropdown(true);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                    aria-label="Clear selection"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search team members..."
                      value={userSearch}
                      onChange={(e) => {
                        setUserSearch(e.target.value);
                        setShowUserDropdown(true);
                      }}
                      onFocus={() => setShowUserDropdown(true)}
                      className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#545859] focus:ring-1 focus:ring-[#545859] outline-none"
                    />
                  </div>
                  {showUserDropdown && (
                    <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                      {isLoadingMembers ? (
                        <div className="px-3 py-2 text-sm text-gray-500">Loading...</div>
                      ) : filteredMembers.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-500">No members found</div>
                      ) : (
                        filteredMembers.map((member) => (
                          <button
                            key={member.user_id}
                            type="button"
                            onClick={() => {
                              setSelectedUserId(member.user_id);
                              setUserSearch('');
                              setShowUserDropdown(false);
                              clearFieldError('targeting');
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                          >
                            <span className="text-gray-900">
                              {member.first_name} {member.last_name}
                            </span>
                            <span className="text-xs text-gray-400 capitalize">{member.role}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Title input */}
        <div>
          <label htmlFor="message-title" className="block text-sm font-medium text-gray-700 mb-1">
            Title
          </label>
          <input
            id="message-title"
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              clearFieldError('title');
            }}
            placeholder="Message title"
            className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-1 ${
              errors.title
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-200 focus:border-[#545859] focus:ring-[#545859]'
            }`}
          />
          {errors.title && (
            <p className="mt-1 text-sm text-red-600" role="alert">{errors.title}</p>
          )}
        </div>

        {/* Body textarea */}
        <div>
          <label htmlFor="message-body" className="block text-sm font-medium text-gray-700 mb-1">
            Message
          </label>
          <textarea
            id="message-body"
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              clearFieldError('body');
            }}
            placeholder="Write your message..."
            rows={6}
            className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none resize-y focus:ring-1 ${
              errors.body
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-200 focus:border-[#545859] focus:ring-[#545859]'
            }`}
          />
          {errors.body && (
            <p className="mt-1 text-sm text-red-600" role="alert">{errors.body}</p>
          )}
        </div>

      </div>

      {/* Footer — always visible, pinned at bottom */}
      <div className="border-t border-gray-200 px-3 py-2 bg-white rounded-b-lg">
        {sendError && (
          <div className="px-3 py-2 mb-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700" role="alert">
            {sendError}
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleSend}
            disabled={isSending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#545859' }}
          >
            <Send className="w-4 h-4" />
            {isSending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
