/** Shared helpers for listing in-app chat polling (buyer + seller). */

export type ChatPollMessage = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export function chatMessageDigest(msgs: ChatPollMessage[]): string {
  return msgs.map((m) => `${m.id}\0${m.created_at}\0${m.body.length}`).join("\n");
}

export function chatMessagesChanged(prev: ChatPollMessage[], fresh: ChatPollMessage[]): boolean {
  if (prev.length !== fresh.length) return true;
  return chatMessageDigest(prev) !== chatMessageDigest(fresh);
}
