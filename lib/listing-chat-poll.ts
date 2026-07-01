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
  return msgs.map((m) => `${chatMessageKey(m)}\0${m.created_at}\0${m.body}`).join("\n");
}

export function messagesContainPaymentDepositNotice(msgs: ChatPollMessage[]): boolean {
  return msgs.some((m) => m.body.includes("pay-deposit-confirmed:"));
}

/** Buyer accept/decline on a provider quote (chat message or system notice). */
export function messagesContainQuoteRespondNotice(msgs: ChatPollMessage[]): boolean {
  return msgs.some(
    (m) =>
      m.body.includes("✅ Acepto") ||
      m.body.includes("✅ I accept") ||
      m.body.includes("❌ Rechazo") ||
      m.body.includes("❌ I decline") ||
      m.body.includes("quote-accepted:") ||
      m.body.includes("Cotización aceptada"),
  );
}

/** Extract NG- ticket from payment-confirmed chat line when present. */
export function extractTicketCodeFromMessages(msgs: ChatPollMessage[]): string | null {
  for (const m of msgs) {
    const match = m.body.match(/Ticket:\s*(NG-[A-F0-9]{8})/i);
    if (match?.[1]) return match[1].toUpperCase();
  }
  return null;
}

export function chatMessagesChanged(prev: ChatPollMessage[], fresh: ChatPollMessage[]): boolean {
  if (prev.length !== fresh.length) return true;
  return chatMessageDigest(prev) !== chatMessageDigest(fresh);
}

export function appendChatMessageDeduped(
  prev: ChatPollMessage[],
  msg: ChatPollMessage,
): ChatPollMessage[] {
  const key = chatMessageKey(msg);
  if (prev.some((m) => chatMessageKey(m) === key)) return prev;
  const bodyDup = prev.some(
    (m) =>
      m.body === msg.body &&
      Math.abs(new Date(m.created_at).getTime() - new Date(msg.created_at).getTime()) < 5000,
  );
  if (bodyDup) return prev;
  return [...prev, msg].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
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
