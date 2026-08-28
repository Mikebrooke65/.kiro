import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { messagingApi } from '../lib/messaging-api';
import { teamsApi } from '../lib/teams-api';
import { useAuth } from './AuthContext';
import type {
  Thread,
  ThreadDetail,
  Message,
  MessageReadReceipt,
  MessageReaction,
  CreateMessagePayload,
  CreateReplyPayload,
} from '../types/database';

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface MessagingState {
  threads: Thread[];
  archivedThreads: Thread[];
  unreadCount: number;
  selectedThread: ThreadDetail | null;
  isLoading: boolean;
}

interface MessagingContextType extends MessagingState {
  sendMessage: (payload: CreateMessagePayload) => Promise<Message>;
  sendReply: (parentId: string, payload: CreateReplyPayload) => Promise<Message>;
  markAsRead: (messageId: string) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  archiveThread: (messageId: string) => Promise<void>;
  unarchiveThread: (messageId: string) => Promise<void>;
  selectThread: (messageId: string | null) => Promise<void>;
  refreshThreads: () => Promise<void>;
}

const MessagingContext = createContext<MessagingContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function MessagingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [archivedThreads, setArchivedThreads] = useState<Thread[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedThread, setSelectedThread] = useState<ThreadDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Refs for cleanup-safe access inside callbacks
  const channelsRef = useRef<RealtimeChannel[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const userId = user?.id ?? '';

  // Derive team IDs from the shared team-access resolver (teamsApi.getMyTeams)
  // rather than a raw team_members query, so a caregiver's linked child's
  // team(s) are included the same way they already are for roster access and
  // for message-send recipients (`resolveRecipients`/`unionTeamAndCaregiverRecipients`).
  //
  // streamlined-invites-and-child-access, 2026-08-28 fix: a caregiver never
  // has their own `team_members` row (only their linked child does), so this
  // used to always come back empty for a caregiver — which meant `fetchThreads`
  // below (gated on `teamIds.length === 0`) silently never ran, and a
  // caregiver could never see or reply to any team conversation, even one
  // they'd just been messaged in. `getMyTeams` was already fixed to union in
  // caregiver-linked teams; reusing it here closes the same gap for
  // messaging. Additive only — a non-caregiver's own team_members rows are
  // still returned exactly as before, just via the shared resolver instead
  // of a duplicate inline query.
  const [teamIds, setTeamIds] = useState<string[]>([]);

  useEffect(() => {
    if (!userId) {
      setTeamIds([]);
      return;
    }
    let cancelled = false;
    teamsApi
      .getMyTeams(userId)
      .then((memberships) => {
        if (cancelled) return;
        const ids = Array.from(new Set(memberships.map((m) => m.team_id)));
        console.log('[MessagingContext] resolved team IDs:', ids);
        setTeamIds(ids);
      })
      .catch((error) => {
        console.error('[MessagingContext] Failed to fetch teams via getMyTeams:', error);
        if (!cancelled) setTeamIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // ---------------------------------------------------------------------------
  // Data fetching helpers
  // ---------------------------------------------------------------------------

  const fetchThreads = useCallback(async () => {
    if (!userId || teamIds.length === 0) {
      console.log('[MessagingContext] Skipping fetch — no userId or no teams');
      return;
    }
    try {
      console.log('[MessagingContext] Fetching threads for user:', userId, 'teams:', teamIds);
      const [active, archived, count] = await Promise.all([
        messagingApi.getThreads(userId, teamIds),
        messagingApi.getArchivedThreads(userId),
        messagingApi.getUnreadCount(userId),
      ]);
      if (!mountedRef.current) return;
      console.log('[MessagingContext] Loaded:', active.length, 'active,', archived.length, 'archived,', count, 'unread');
      setThreads(active);
      setArchivedThreads(archived);
      setUnreadCount(count);
    } catch (err) {
      console.error('[MessagingContext] Failed to fetch threads:', err);
    }
  }, [userId, teamIds.join(',')]);

  // ---------------------------------------------------------------------------
  // Polling fallback
  // ---------------------------------------------------------------------------

  const startPolling = useCallback(() => {
    if (pollingRef.current) return; // already polling
    console.warn('[MessagingContext] Realtime unavailable — starting 30s polling fallback');
    pollingRef.current = setInterval(() => {
      fetchThreads();
    }, 30_000);
  }, [fetchThreads]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      console.log('[MessagingContext] Realtime reconnected — stopping polling');
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Realtime subscriptions
  // ---------------------------------------------------------------------------

  const setupSubscriptions = useCallback(() => {
    if (!userId || teamIds.length === 0) return;

    // Clean up any existing channels first
    channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
    channelsRef.current = [];

    // 1. Messages channel — new messages for user's teams
    const messagesChannel = supabase
      .channel('messaging-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `team_id=in.(${teamIds.join(',')})`,
        },
        (_payload) => {
          // A new message arrived — refresh the full thread list to get
          // properly joined data (sender name, read counts, etc.)
          fetchThreads();
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          startPolling();
        } else if (status === 'SUBSCRIBED') {
          stopPolling();
          // Fetch any messages we may have missed while disconnected
          fetchThreads();
        }
      });

    // 2. Read receipts channel
    const readReceiptsChannel = supabase
      .channel('messaging-read-receipts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_read_receipts',
        },
        (payload) => {
          const receipt = payload.new as MessageReadReceipt;
          if (!mountedRef.current) return;

          // Update read count on matching thread
          setThreads((prev) =>
            prev.map((t) => {
              if (t.message.id === receipt.message_id) {
                return {
                  ...t,
                  read_count: t.read_count + 1,
                  is_read: receipt.user_id === userId ? true : t.is_read,
                };
              }
              return t;
            })
          );

          // Decrement unread count if this receipt is for the current user
          if (receipt.user_id === userId) {
            setUnreadCount((prev) => Math.max(0, prev - 1));
          }

          // Update selected thread detail if viewing this thread
          setSelectedThread((prev) => {
            if (!prev || prev.thread.message.id !== receipt.message_id) return prev;
            return {
              ...prev,
              thread: {
                ...prev.thread,
                read_count: prev.thread.read_count + 1,
                is_read: receipt.user_id === userId ? true : prev.thread.is_read,
              },
            };
          });
        }
      )
      .subscribe();

    // 3. Reactions channel
    const reactionsChannel = supabase
      .channel('messaging-reactions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
        },
        (_payload) => {
          // Reactions changed — refresh threads to get updated grouped reactions
          fetchThreads();
          // Also refresh selected thread detail if open
          setSelectedThread((prev) => {
            if (!prev) return prev;
            messagingApi.getThreadDetail(prev.thread.message.id).then((detail) => {
              if (mountedRef.current) setSelectedThread(detail);
            });
            return prev;
          });
        }
      )
      .subscribe();

    channelsRef.current = [messagesChannel, readReceiptsChannel, reactionsChannel];
  }, [userId, teamIds.join(','), fetchThreads, startPolling, stopPolling]);

  // ---------------------------------------------------------------------------
  // Lifecycle — mount / unmount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    mountedRef.current = true;

    if (userId && teamIds.length > 0) {
      setIsLoading(true);
      fetchThreads().finally(() => {
        if (mountedRef.current) setIsLoading(false);
      });
      setupSubscriptions();
    } else {
      // No user or no teams — nothing to load, clear the spinner
      setIsLoading(false);
    }

    return () => {
      mountedRef.current = false;
      // Tear down Realtime channels
      channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
      channelsRef.current = [];
      // Stop polling if active
      stopPolling();
    };
  }, [userId, teamIds.join(',')]);

  // ---------------------------------------------------------------------------
  // Actions (optimistic updates with rollback)
  // ---------------------------------------------------------------------------

  const sendMessage = useCallback(
    async (payload: CreateMessagePayload): Promise<Message> => {
      const msg = await messagingApi.createMessage(payload);
      // Refresh threads to pick up the new message with full join data
      await fetchThreads();
      return msg;
    },
    [fetchThreads]
  );

  const sendReply = useCallback(
    async (parentId: string, payload: CreateReplyPayload): Promise<Message> => {
      const reply = await messagingApi.createReply(parentId, payload);
      // Refresh threads (reply updates last_activity)
      await fetchThreads();
      // Refresh selected thread detail if viewing this thread
      if (selectedThread?.thread.message.id === parentId) {
        const detail = await messagingApi.getThreadDetail(parentId);
        if (mountedRef.current) setSelectedThread(detail);
      }
      return reply;
    },
    [fetchThreads, selectedThread]
  );

  const markAsReadAction = useCallback(
    async (messageId: string) => {
      // Optimistic: mark as read immediately
      const prevThreads = threads;
      const prevUnread = unreadCount;

      setThreads((prev) =>
        prev.map((t) =>
          t.message.id === messageId ? { ...t, is_read: true } : t
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      try {
        await messagingApi.markAsRead(messageId, userId);
      } catch (err) {
        // Rollback on failure
        console.error('[MessagingContext] markAsRead failed, rolling back:', err);
        if (mountedRef.current) {
          setThreads(prevThreads);
          setUnreadCount(prevUnread);
        }
      }
    },
    [userId, threads, unreadCount]
  );

  const toggleReactionAction = useCallback(
    async (messageId: string, emoji: string) => {
      // Optimistic: toggle reaction in local state
      const prevThreads = threads;

      setThreads((prev) =>
        prev.map((t) => {
          if (t.message.id !== messageId) return t;
          const reactions = [...t.reactions];
          const idx = reactions.findIndex((r) => r.emoji === emoji);
          if (idx >= 0) {
            const group = reactions[idx];
            if (group.user_ids.includes(userId)) {
              // Remove user's reaction
              const newUserIds = group.user_ids.filter((id) => id !== userId);
              if (newUserIds.length === 0) {
                reactions.splice(idx, 1);
              } else {
                reactions[idx] = { ...group, user_ids: newUserIds, count: newUserIds.length };
              }
            } else {
              // Add user's reaction
              reactions[idx] = {
                ...group,
                user_ids: [...group.user_ids, userId],
                count: group.count + 1,
              };
            }
          } else {
            // New emoji group
            reactions.push({ emoji, count: 1, user_ids: [userId] });
          }
          return { ...t, reactions };
        })
      );

      try {
        await messagingApi.toggleReaction(messageId, userId, emoji);
      } catch (err) {
        console.error('[MessagingContext] toggleReaction failed, rolling back:', err);
        if (mountedRef.current) setThreads(prevThreads);
      }
    },
    [userId, threads]
  );

  const archiveThreadAction = useCallback(
    async (messageId: string) => {
      // Optimistic: move thread from active to archived
      const prevThreads = threads;
      const prevArchived = archivedThreads;

      const threadToArchive = threads.find((t) => t.message.id === messageId);
      if (threadToArchive) {
        setThreads((prev) => prev.filter((t) => t.message.id !== messageId));
        setArchivedThreads((prev) => [
          { ...threadToArchive, is_archived: true },
          ...prev,
        ]);
      }

      try {
        await messagingApi.archiveThread(messageId, userId);
      } catch (err) {
        console.error('[MessagingContext] archiveThread failed, rolling back:', err);
        if (mountedRef.current) {
          setThreads(prevThreads);
          setArchivedThreads(prevArchived);
        }
      }
    },
    [userId, threads, archivedThreads]
  );

  const unarchiveThreadAction = useCallback(
    async (messageId: string) => {
      // Optimistic: move thread from archived to active
      const prevThreads = threads;
      const prevArchived = archivedThreads;

      const threadToRestore = archivedThreads.find((t) => t.message.id === messageId);
      if (threadToRestore) {
        setArchivedThreads((prev) => prev.filter((t) => t.message.id !== messageId));
        setThreads((prev) =>
          [{ ...threadToRestore, is_archived: false }, ...prev].sort(
            (a, b) => new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime()
          )
        );
      }

      try {
        await messagingApi.unarchiveThread(messageId, userId);
      } catch (err) {
        console.error('[MessagingContext] unarchiveThread failed, rolling back:', err);
        if (mountedRef.current) {
          setThreads(prevThreads);
          setArchivedThreads(prevArchived);
        }
      }
    },
    [userId, threads, archivedThreads]
  );

  const selectThread = useCallback(
    async (messageId: string | null) => {
      if (!messageId) {
        setSelectedThread(null);
        return;
      }
      try {
        const detail = await messagingApi.getThreadDetail(messageId);
        if (mountedRef.current) setSelectedThread(detail);
      } catch (err) {
        console.error('[MessagingContext] Failed to load thread detail:', err);
      }
    },
    []
  );

  // ---------------------------------------------------------------------------
  // Context value
  // ---------------------------------------------------------------------------

  const value: MessagingContextType = {
    threads,
    archivedThreads,
    unreadCount,
    selectedThread,
    isLoading,
    sendMessage,
    sendReply,
    markAsRead: markAsReadAction,
    toggleReaction: toggleReactionAction,
    archiveThread: archiveThreadAction,
    unarchiveThread: unarchiveThreadAction,
    selectThread,
    refreshThreads: fetchThreads,
  };

  return (
    <MessagingContext.Provider value={value}>{children}</MessagingContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMessaging() {
  const context = useContext(MessagingContext);
  if (context === undefined) {
    throw new Error('useMessaging must be used within a MessagingProvider');
  }
  return context;
}
