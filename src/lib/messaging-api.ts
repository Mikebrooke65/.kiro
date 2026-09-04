import { ApiClient, ApiError } from './api-client';
import { unionTeamAndCaregiverRecipients } from './messaging-logic';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  Message,
  MessageRecipient,
  MessageReadReceipt,
  MessageReaction,
  MessageTargetingType,
  Thread,
  ThreadDetail,
  ReactionGroup,
  CreateMessagePayload,
  CreateReplyPayload,
  SearchResult,
} from '../types/database';

export class MessagingApi extends ApiClient {
  /**
   * Fetch active top-level threads for a user across their teams.
   * Joins with users for sender name, message_recipients for targeting info,
   * counts replies, gets last activity, counts read receipts, checks user read status,
   * and excludes archived threads. Sorted by last activity DESC.
   */
  async getThreads(userId: string, teamIds: string[]): Promise<Thread[]> {
    // Fetch top-level messages (parent_message_id IS NULL) for the user's teams
    // NOTE: Cannot self-join messages for replies — PostgREST doesn't support it.
    // We fetch reply counts in a separate query.
    const { data: messages, error } = await this.supabase
      .from('messages')
      .select(`
        *,
        sender:users!messages_sender_id_fkey(first_name, last_name),
        recipients:message_recipients(id, message_id, targeting_type, recipient_user_ids, notification_pending),
        read_receipts:message_read_receipts(id, user_id),
        reactions:message_reactions(emoji, user_id),
        archives:message_archives(id, user_id)
      `)
      // Include the user's team threads AND team-less "club admin" threads
      // (migration 075). RLS still gates which team-less rows are visible
      // (admins see the shared inbox; a non-admin sees only threads they
      // started), and the recipient/sender filter below narrows further.
      .is('parent_message_id', null)
      .or(teamIds.length > 0 ? `team_id.in.(${teamIds.join(',')}),team_id.is.null` : 'team_id.is.null')
      .order('created_at', { ascending: false });

    if (error) throw new ApiError(error.message);
    if (!messages) return [];

    // Fetch reply counts and last reply dates for these top-level messages
    const messageIds = messages.map((m: any) => m.id);
    let repliesByParent: Record<string, { count: number; lastReplyAt: string }> = {};

    if (messageIds.length > 0) {
      const { data: replies } = await this.supabase
        .from('messages')
        .select('parent_message_id, created_at')
        .in('parent_message_id', messageIds);

      if (replies) {
        for (const r of replies) {
          const pid = r.parent_message_id as string;
          if (!repliesByParent[pid]) {
            repliesByParent[pid] = { count: 0, lastReplyAt: r.created_at };
          }
          repliesByParent[pid].count++;
          if (r.created_at > repliesByParent[pid].lastReplyAt) {
            repliesByParent[pid].lastReplyAt = r.created_at;
          }
        }
      }
    }

    const threads: Thread[] = messages
      .map((msg: any) => {
        const recipient: MessageRecipient | undefined = msg.recipients?.[0];
        if (!recipient) return null;

        // Check if user has archived this thread
        const isArchived = (msg.archives || []).some(
          (a: any) => a.user_id === userId
        );

        // Exclude archived threads
        if (isArchived) return null;

        // Check if user is sender or in recipient set
        const isInRecipientSet =
          msg.sender_id === userId ||
          (recipient.recipient_user_ids || []).includes(userId);

        if (!isInRecipientSet) return null;

        const replyInfo = repliesByParent[msg.id];
        const readReceipts = msg.read_receipts || [];
        const reactions = msg.reactions || [];

        // Calculate last activity: max of message created_at and last reply
        const messageDateMs = new Date(msg.created_at).getTime();
        const lastReplyMs = replyInfo ? new Date(replyInfo.lastReplyAt).getTime() : 0;
        const lastActivityMs = Math.max(messageDateMs, lastReplyMs);
        const lastActivity = new Date(lastActivityMs).toISOString();

        // Count read receipts and check if user has read
        const readCount = readReceipts.length;
        const totalRecipients = recipient.recipient_user_ids.length;
        const isRead = readReceipts.some((r: any) => r.user_id === userId);

        // Group reactions
        const reactionGroups = groupReactions(reactions);

        return {
          message: {
            id: msg.id,
            sender_id: msg.sender_id,
            team_id: msg.team_id,
            parent_message_id: msg.parent_message_id,
            title: msg.title,
            body: msg.body,
            created_at: msg.created_at,
          },
          sender: {
            first_name: msg.sender?.first_name || '',
            last_name: msg.sender?.last_name || '',
          },
          recipient,
          reply_count: replyInfo?.count ?? 0,
          last_activity: lastActivity,
          read_count: readCount,
          total_recipients: totalRecipients,
          is_read: isRead,
          is_archived: false,
          reactions: reactionGroups,
        } as Thread;
      })
      .filter((t: Thread | null): t is Thread => t !== null);

    // Sort by last activity DESC
    threads.sort(
      (a, b) =>
        new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime()
    );

    return threads;
  }

  /**
   * Fetch the top-level message + all replies with sender info and reactions.
   */
  async getThreadDetail(messageId: string): Promise<ThreadDetail> {
    // Fetch the top-level message with all related data
    const { data: msg, error: msgError } = await this.supabase
      .from('messages')
      .select(`
        *,
        sender:users!messages_sender_id_fkey(first_name, last_name),
        recipients:message_recipients(id, message_id, targeting_type, recipient_user_ids, notification_pending),
        read_receipts:message_read_receipts(id, user_id),
        reactions:message_reactions(emoji, user_id),
        archives:message_archives(id, user_id)
      `)
      .eq('id', messageId)
      .single();

    if (msgError) throw new ApiError(msgError.message);

    const recipient: MessageRecipient = msg.recipients?.[0] || {
      id: '',
      message_id: messageId,
      targeting_type: 'individual' as MessageTargetingType,
      recipient_user_ids: [],
      notification_pending: false,
    };

    const readReceipts = msg.read_receipts || [];
    const reactions = msg.reactions || [];

    // Fetch all replies (where parent_message_id = messageId)
    const { data: replies, error: repliesError } = await this.supabase
      .from('messages')
      .select(`
        *,
        sender:users!messages_sender_id_fkey(first_name, last_name),
        reactions:message_reactions(emoji, user_id)
      `)
      .eq('parent_message_id', messageId)
      .order('created_at', { ascending: true });

    if (repliesError) throw new ApiError(repliesError.message);

    // Calculate last activity
    const replyDates = (replies || []).map((r: any) => new Date(r.created_at).getTime());
    const messageDateMs = new Date(msg.created_at).getTime();
    const lastActivityMs = Math.max(messageDateMs, ...replyDates);

    const thread: Thread = {
      message: {
        id: msg.id,
        sender_id: msg.sender_id,
        team_id: msg.team_id,
        parent_message_id: msg.parent_message_id,
        title: msg.title,
        body: msg.body,
        created_at: msg.created_at,
      },
      sender: {
        first_name: msg.sender?.first_name || '',
        last_name: msg.sender?.last_name || '',
      },
      recipient,
      reply_count: (replies || []).length,
      last_activity: new Date(lastActivityMs).toISOString(),
      read_count: readReceipts.length,
      total_recipients: recipient.recipient_user_ids.length,
      is_read: false, // Caller should determine this based on current user
      is_archived: false,
      reactions: groupReactions(reactions),
    };

    const formattedReplies = (replies || []).map((r: any) => ({
      id: r.id,
      sender_id: r.sender_id,
      team_id: r.team_id,
      parent_message_id: r.parent_message_id,
      title: r.title,
      body: r.body,
      created_at: r.created_at,
      sender: {
        first_name: r.sender?.first_name || '',
        last_name: r.sender?.last_name || '',
      },
      reactions: groupReactions(r.reactions || []),
    }));

    return { thread, replies: formattedReplies };
  }

  /**
   * Create a new top-level message, resolve recipients, and insert into message_recipients.
   */
  async createMessage(payload: CreateMessagePayload): Promise<Message> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) throw new ApiError('Not authenticated');

    // Insert the message
    const { data: message, error: msgError } = await this.supabase
      .from('messages')
      .insert({
        sender_id: user.id,
        team_id: payload.team_id,
        title: payload.title,
        body: payload.body,
        parent_message_id: null,
      })
      .select()
      .single();

    if (msgError) throw new ApiError(msgError.message);

    // Resolve recipients based on targeting type
    const recipientUserIds = await this.resolveRecipients(
      payload.targeting_type,
      payload.team_id,
      payload.individual_user_id
    );

    // Insert message_recipients record
    const { error: recipError } = await this.supabase
      .from('message_recipients')
      .insert({
        message_id: message.id,
        targeting_type: payload.targeting_type,
        recipient_user_ids: recipientUserIds,
      });

    if (recipError) throw new ApiError(recipError.message);

    return message as Message;
  }

  /**
   * Create a reply to a message. Finds the top-level message for the given parentId,
   * inserts the reply with parent_message_id set to the top-level message ID,
   * and inherits the title from the parent.
   */
  async createReply(parentId: string, payload: CreateReplyPayload): Promise<Message> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) throw new ApiError('Not authenticated');

    // Find the top-level message (walk up if parentId is itself a reply)
    const { data: parentMsg, error: parentError } = await this.supabase
      .from('messages')
      .select('id, parent_message_id, title, team_id')
      .eq('id', parentId)
      .single();

    if (parentError) throw new ApiError(parentError.message);

    // Determine the top-level message ID
    const topLevelId = parentMsg.parent_message_id || parentMsg.id;

    // If parentId was a reply, fetch the top-level message for its title
    let title = parentMsg.title;
    if (parentMsg.parent_message_id) {
      const { data: topLevel, error: topError } = await this.supabase
        .from('messages')
        .select('title')
        .eq('id', topLevelId)
        .single();

      if (topError) throw new ApiError(topError.message);
      title = topLevel.title;
    }

    // Insert the reply with parent_message_id set to the top-level message
    const { data: reply, error: replyError } = await this.supabase
      .from('messages')
      .insert({
        sender_id: user.id,
        team_id: parentMsg.team_id,
        parent_message_id: topLevelId,
        title,
        body: payload.body,
      })
      .select()
      .single();

    if (replyError) throw new ApiError(replyError.message);

    return reply as Message;
  }

  /**
   * Resolve recipient user IDs based on targeting type.
   * - 'individual': returns [individualUserId]
   * - 'whole_team': queries team_members for the team, plus every caregiver
   *   derived-affiliated to it (Req 6.3 — see `unionTeamAndCaregiverRecipients`)
   * - 'management_team': queries team_members where role in ('coach', 'manager'), returns user_ids
   * - 'club_admin': queries users where role = 'admin', returns user_ids
   */
  async resolveRecipients(
    targetType: MessageTargetingType,
    teamId: string | null,
    individualUserId?: string
  ): Promise<string[]> {
    switch (targetType) {
      case 'individual': {
        if (!individualUserId) {
          throw new ApiError('Individual user ID is required for individual targeting');
        }
        return [individualUserId];
      }

      case 'whole_team': {
        const { data: members, error: membersError } = await this.supabase
          .from('team_members')
          .select('user_id, user:users(active)')
          .eq('team_id', teamId);

        if (membersError) throw new ApiError(membersError.message);

        const memberIds = (members || []).map((row: any) => row.user_id as string);

        // add-player-and-dob-age-model Requirement 6.3: derived caregiver
        // affiliation. No direct foreign key links player_caregivers to
        // team_members (both reference users independently, not each
        // other), so this is a second explicit query rather than a single
        // embed — "active" here is `users.active` (team_members itself has
        // no active column, migration 021), matching how a pending child's
        // inactive status is read everywhere else in this app.
        const activeMemberIds = (members || [])
          .filter((row: any) => row.user?.active ?? true)
          .map((row: any) => row.user_id as string);

        let caregiverIds: string[] = [];
        if (activeMemberIds.length > 0) {
          const { data: caregiverLinks, error: linksError } = await this.supabase
            .from('player_caregivers')
            .select('caregiver_id')
            .in('player_id', activeMemberIds);

          if (linksError) {
            // Error Handling (design.md): a caregiver being temporarily
            // missing from one message is preferable to failing the whole
            // send. Logged, not surfaced to the sender.
            console.error(
              'resolveRecipients: player_caregivers lookup failed, falling back to team_members only',
              linksError
            );
          } else {
            caregiverIds = (caregiverLinks || []).map((row: any) => row.caregiver_id as string);
          }
        }

        return unionTeamAndCaregiverRecipients(memberIds, caregiverIds);
      }

      case 'management_team': {
        const { data, error } = await this.supabase
          .from('team_members')
          .select('user_id')
          .eq('team_id', teamId)
          .in('role', ['coach', 'manager']);

        if (error) throw new ApiError(error.message);
        return (data || []).map((row: any) => row.user_id);
      }

      case 'club_admin': {
        const { data, error } = await this.supabase
          .from('users')
          .select('id')
          .eq('role', 'admin');

        if (error) throw new ApiError(error.message);
        return (data || []).map((row: any) => row.id);
      }

      default:
        throw new ApiError(`Unknown targeting type: ${targetType}`);
    }
  }

  // ── Task 2.3: Read receipt and unread count methods ──

  /**
   * Mark a message as read for a user. Upserts into message_read_receipts
   * with retry logic (3 retries, exponential backoff 1s/2s/4s).
   */
  async markAsRead(messageId: string, userId: string): Promise<void> {
    const delays = [1000, 2000, 4000];
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      const { error } = await this.supabase
        .from('message_read_receipts')
        .upsert(
          { message_id: messageId, user_id: userId, read_at: new Date().toISOString() },
          { onConflict: 'message_id,user_id' }
        );

      if (!error) return;

      lastError = new Error(error.message);
      if (attempt < delays.length) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
    }

    throw new ApiError(lastError?.message || 'Failed to mark message as read after retries');
  }

  /**
   * Fetch all read receipts for a message, joined with users for names.
   */
  async getReadReceipts(messageId: string): Promise<MessageReadReceipt[]> {
    const { data, error } = await this.supabase
      .from('message_read_receipts')
      .select(`
        *,
        user:users!message_read_receipts_user_id_fkey(first_name, last_name)
      `)
      .eq('message_id', messageId);

    if (error) throw new ApiError(error.message);
    return (data || []) as MessageReadReceipt[];
  }

  /**
   * Count messages where user is in recipient_user_ids and has no read receipt.
   */
  async getUnreadCount(userId: string): Promise<number> {
    // Get all message_recipients rows where userId is in the recipient array
    const { data: recipientRows, error: recipError } = await this.supabase
      .from('message_recipients')
      .select('message_id')
      .contains('recipient_user_ids', [userId]);

    if (recipError) throw new ApiError(recipError.message);
    if (!recipientRows || recipientRows.length === 0) return 0;

    const messageIds = recipientRows.map((r: any) => r.message_id);

    // Get read receipts for this user on those messages
    const { data: readReceipts, error: readError } = await this.supabase
      .from('message_read_receipts')
      .select('message_id')
      .eq('user_id', userId)
      .in('message_id', messageIds);

    if (readError) throw new ApiError(readError.message);

    const readMessageIds = new Set((readReceipts || []).map((r: any) => r.message_id));

    // Only count top-level messages (not replies) that are unread
    const unreadMessageIds = messageIds.filter((id: string) => !readMessageIds.has(id));

    // Filter to top-level messages only
    if (unreadMessageIds.length === 0) return 0;

    const { data: topLevel, error: topError } = await this.supabase
      .from('messages')
      .select('id')
      .in('id', unreadMessageIds)
      .is('parent_message_id', null);

    if (topError) throw new ApiError(topError.message);

    return (topLevel || []).length;
  }

  // ── Task 2.5: Reaction methods ──

  /**
   * Toggle a reaction: if it exists, delete it; if not, insert it.
   */
  async toggleReaction(messageId: string, userId: string, emoji: string): Promise<void> {
    // Check if reaction already exists
    const { data: existing, error: checkError } = await this.supabase
      .from('message_reactions')
      .select('id')
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .eq('emoji', emoji)
      .maybeSingle();

    if (checkError) throw new ApiError(checkError.message);

    if (existing) {
      // Remove existing reaction
      const { error: deleteError } = await this.supabase
        .from('message_reactions')
        .delete()
        .eq('id', existing.id);

      if (deleteError) throw new ApiError(deleteError.message);
    } else {
      // Insert new reaction
      const { error: insertError } = await this.supabase
        .from('message_reactions')
        .insert({ message_id: messageId, user_id: userId, emoji });

      if (insertError) throw new ApiError(insertError.message);
    }
  }

  /**
   * Fetch reactions for a message, grouped by emoji.
   */
  async getReactions(messageId: string): Promise<ReactionGroup[]> {
    const { data, error } = await this.supabase
      .from('message_reactions')
      .select('emoji, user_id')
      .eq('message_id', messageId);

    if (error) throw new ApiError(error.message);
    return groupReactions(data || []);
  }

  // ── Task 2.7: Archiving methods ──

  /**
   * Archive a thread for a user.
   */
  async archiveThread(messageId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('message_archives')
      .insert({ message_id: messageId, user_id: userId });

    if (error) throw new ApiError(error.message);
  }

  /**
   * Unarchive a thread for a user.
   */
  async unarchiveThread(messageId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('message_archives')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', userId);

    if (error) throw new ApiError(error.message);
  }

  /**
   * Fetch archived threads for a user. Similar to getThreads but only returns
   * threads that ARE archived by this user.
   */
  async getArchivedThreads(userId: string): Promise<Thread[]> {
    // Get message IDs archived by this user
    const { data: archives, error: archError } = await this.supabase
      .from('message_archives')
      .select('message_id')
      .eq('user_id', userId);

    if (archError) throw new ApiError(archError.message);
    if (!archives || archives.length === 0) return [];

    const archivedMessageIds = archives.map((a: any) => a.message_id);

    // Fetch those messages with all related data (no self-join for replies)
    const { data: messages, error } = await this.supabase
      .from('messages')
      .select(`
        *,
        sender:users!messages_sender_id_fkey(first_name, last_name),
        recipients:message_recipients(id, message_id, targeting_type, recipient_user_ids, notification_pending),
        read_receipts:message_read_receipts(id, user_id),
        reactions:message_reactions(emoji, user_id)
      `)
      .in('id', archivedMessageIds)
      .is('parent_message_id', null)
      .order('created_at', { ascending: false });

    if (error) throw new ApiError(error.message);
    if (!messages) return [];

    // Fetch reply counts for archived messages
    let repliesByParent: Record<string, { count: number; lastReplyAt: string }> = {};
    const msgIds = messages.map((m: any) => m.id);
    if (msgIds.length > 0) {
      const { data: replies } = await this.supabase
        .from('messages')
        .select('parent_message_id, created_at')
        .in('parent_message_id', msgIds);

      if (replies) {
        for (const r of replies) {
          const pid = r.parent_message_id as string;
          if (!repliesByParent[pid]) {
            repliesByParent[pid] = { count: 0, lastReplyAt: r.created_at };
          }
          repliesByParent[pid].count++;
          if (r.created_at > repliesByParent[pid].lastReplyAt) {
            repliesByParent[pid].lastReplyAt = r.created_at;
          }
        }
      }
    }

    const threads: Thread[] = messages
      .map((msg: any) => {
        const recipient: MessageRecipient | undefined = msg.recipients?.[0];
        if (!recipient) return null;

        const replyInfo = repliesByParent[msg.id];
        const readReceipts = msg.read_receipts || [];
        const reactions = msg.reactions || [];

        const messageDateMs = new Date(msg.created_at).getTime();
        const lastReplyMs = replyInfo ? new Date(replyInfo.lastReplyAt).getTime() : 0;
        const lastActivityMs = Math.max(messageDateMs, lastReplyMs);

        return {
          message: {
            id: msg.id,
            sender_id: msg.sender_id,
            team_id: msg.team_id,
            parent_message_id: msg.parent_message_id,
            title: msg.title,
            body: msg.body,
            created_at: msg.created_at,
          },
          sender: {
            first_name: msg.sender?.first_name || '',
            last_name: msg.sender?.last_name || '',
          },
          recipient,
          reply_count: replyInfo?.count ?? 0,
          last_activity: new Date(lastActivityMs).toISOString(),
          read_count: readReceipts.length,
          total_recipients: recipient.recipient_user_ids.length,
          is_read: readReceipts.some((r: any) => r.user_id === userId),
          is_archived: true,
          reactions: groupReactions(reactions),
        } as Thread;
      })
      .filter((t: Thread | null): t is Thread => t !== null);

    threads.sort(
      (a, b) =>
        new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime()
    );

    return threads;
  }

  // ── Task 2.9: Search method ──

  /**
   * Search messages by title, body, or sender name. Includes both active and
   * archived messages with is_archived status.
   */
  async searchMessages(query: string, userId: string): Promise<SearchResult[]> {
    const searchTerm = `%${query}%`;

    // Fetch all top-level messages the user can see, with sender info (no self-join for replies)
    const { data: messages, error } = await this.supabase
      .from('messages')
      .select(`
        *,
        sender:users!messages_sender_id_fkey(first_name, last_name),
        recipients:message_recipients(id, message_id, targeting_type, recipient_user_ids, notification_pending),
        read_receipts:message_read_receipts(id, user_id),
        reactions:message_reactions(emoji, user_id),
        archives:message_archives(id, user_id)
      `)
      .is('parent_message_id', null)
      .or(`title.ilike.${searchTerm},body.ilike.${searchTerm}`)
      .order('created_at', { ascending: false });

    if (error) throw new ApiError(error.message);
    if (!messages) return [];

    // Fetch reply counts for matched messages
    const msgIds = messages.map((m: any) => m.id);
    let repliesByParent: Record<string, { count: number; lastReplyAt: string }> = {};
    if (msgIds.length > 0) {
      const { data: replies } = await this.supabase
        .from('messages')
        .select('parent_message_id, created_at')
        .in('parent_message_id', msgIds);
      if (replies) {
        for (const r of replies) {
          const pid = r.parent_message_id as string;
          if (!repliesByParent[pid]) {
            repliesByParent[pid] = { count: 0, lastReplyAt: r.created_at };
          }
          repliesByParent[pid].count++;
          if (r.created_at > repliesByParent[pid].lastReplyAt) {
            repliesByParent[pid].lastReplyAt = r.created_at;
          }
        }
      }
    }

    const results: SearchResult[] = messages
      .map((msg: any) => {
        const recipient: MessageRecipient | undefined = msg.recipients?.[0];
        if (!recipient) return null;

        const isInRecipientSet =
          msg.sender_id === userId ||
          (recipient.recipient_user_ids || []).includes(userId);
        if (!isInRecipientSet) return null;

        const replyInfo = repliesByParent[msg.id];
        const readReceipts = msg.read_receipts || [];
        const reactions = msg.reactions || [];
        const isArchived = (msg.archives || []).some((a: any) => a.user_id === userId);

        const messageDateMs = new Date(msg.created_at).getTime();
        const lastReplyMs = replyInfo ? new Date(replyInfo.lastReplyAt).getTime() : 0;
        const lastActivityMs = Math.max(messageDateMs, lastReplyMs);

        const titleLower = (msg.title || '').toLowerCase();
        const bodyLower = (msg.body || '').toLowerCase();
        const queryLower = query.toLowerCase();
        let matchContext = '';
        if (titleLower.includes(queryLower)) matchContext = msg.title;
        else if (bodyLower.includes(queryLower)) matchContext = msg.body;
        else {
          const senderName = `${msg.sender?.first_name || ''} ${msg.sender?.last_name || ''}`;
          if (senderName.toLowerCase().includes(queryLower)) matchContext = senderName;
        }

        const thread: Thread = {
          message: {
            id: msg.id,
            sender_id: msg.sender_id,
            team_id: msg.team_id,
            parent_message_id: msg.parent_message_id,
            title: msg.title,
            body: msg.body,
            created_at: msg.created_at,
          },
          sender: {
            first_name: msg.sender?.first_name || '',
            last_name: msg.sender?.last_name || '',
          },
          recipient,
          reply_count: replyInfo?.count ?? 0,
          last_activity: new Date(lastActivityMs).toISOString(),
          read_count: readReceipts.length,
          total_recipients: recipient.recipient_user_ids.length,
          is_read: readReceipts.some((r: any) => r.user_id === userId),
          is_archived: isArchived,
          reactions: groupReactions(reactions),
        };

        return {
          thread,
          match_context: matchContext,
          is_archived: isArchived,
        } as SearchResult;
      })
      .filter((r: SearchResult | null): r is SearchResult => r !== null);

    return results;
  }

  // ── Task 2.11: Realtime subscription methods ──

  /**
   * Subscribe to new messages for the given teams.
   */
  subscribeToMessages(
    teamIds: string[],
    callback: (msg: Message) => void
  ): RealtimeChannel {
    return this.supabase
      .channel('messages-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `team_id=in.(${teamIds.join(',')})`,
        },
        (payload) => {
          callback(payload.new as Message);
        }
      )
      .subscribe();
  }

  /**
   * Subscribe to new read receipts for the given message IDs.
   */
  subscribeToReadReceipts(
    messageIds: string[],
    callback: (receipt: MessageReadReceipt) => void
  ): RealtimeChannel {
    return this.supabase
      .channel('read-receipts-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_read_receipts',
          filter: `message_id=in.(${messageIds.join(',')})`,
        },
        (payload) => {
          callback(payload.new as MessageReadReceipt);
        }
      )
      .subscribe();
  }

  /**
   * Subscribe to reaction inserts and deletes for the given message IDs.
   */
  subscribeToReactions(
    messageIds: string[],
    callback: (reaction: MessageReaction) => void
  ): RealtimeChannel {
    return this.supabase
      .channel('reactions-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
          filter: `message_id=in.(${messageIds.join(',')})`,
        },
        (payload) => {
          callback((payload.new || payload.old) as MessageReaction);
        }
      )
      .subscribe();
  }
}

/**
 * Group raw reaction rows into ReactionGroup[] by emoji.
 */
function groupReactions(
  reactions: { emoji: string; user_id: string }[]
): ReactionGroup[] {
  const map = new Map<string, string[]>();
  for (const r of reactions) {
    const existing = map.get(r.emoji) || [];
    existing.push(r.user_id);
    map.set(r.emoji, existing);
  }
  return Array.from(map.entries()).map(([emoji, user_ids]) => ({
    emoji,
    count: user_ids.length,
    user_ids,
  }));
}

export const messagingApi = new MessagingApi();
