/** Shared helpers for listing in-app chat polling (buyer + seller). */

export type ChatPollMessage = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export function normalizeConversationId(id: string): string {
  return id.trim().toLowerCase();
}

export function chatMessageKey(m: ChatPollMessage): string {
  return m.id.trim().toLowerCase();
}

export function chatMessageDigest(msgs: ChatPollMessage[]): string {
  return msgs.map((m) => `${chatMessageKey(m)}\0${m.created_at}\0${m.body.length}`).join("\n");
}

export function chatMessagesChanged(prev: ChatPollMessage[], fresh: ChatPollMessage[]): boolean {
  if (prev.length !== fresh.length) return true;
  return chatMessageDigest(prev) !== chatMessageDigest(fresh);
}

/** Keep optimistic/local rows when a poll returns stale data right after send. */
export function mergeChatMessagesOnPoll(
  prev: ChatPollMessage[],
  fresh: ChatPollMessage[],
): ChatPollMessage[] {
  if (fresh.length === 0) return prev.length > 0 ? prev : fresh;
  const byId = new Map<string, ChatPollMessage>();
  for (const m of fresh) byId.set(chatMessageKey(m), m);
  for (const m of prev) {
    const key = chatMessageKey(m);
    if (!byId.has(key)) byId.set(key, m);
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

export function applyChatPollUpdate(prev: ChatPollMessage[], fresh: ChatPollMessage[]): ChatPollMessage[] {
  if (!chatMessagesChanged(prev, fresh)) return prev;
  return mergeChatMessagesOnPoll(prev, fresh);
}

export function threadActivitySig(lastAt: string, lastBody: string): string {
  return `${lastAt}:${lastBody}`;
}
