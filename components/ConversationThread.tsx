"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n-lang";
import { formatDateTimeShort } from "@/lib/locale-format";

type Msg = { id: string; sender_id: string; body: string; created_at: string };

const UI = {
  es: {
    loadErr: "No se pudo cargar",
    sendErr: "No se pudo enviar",
    loading: "Cargando…",
    conversation: "Conversación",
    buyer: "Comprador",
    seller: "Vendedor",
    placeholder: "Escribe un mensaje…",
    send: "Enviar",
  },
  en: {
    loadErr: "Could not load",
    sendErr: "Could not send",
    loading: "Loading…",
    conversation: "Conversation",
    buyer: "Buyer",
    seller: "Seller",
    placeholder: "Type a message…",
    send: "Send",
  },
} as const;

/** Load one thread by id (used on /messages/[conversationId]). */
export default function ConversationThread({
  conversationId,
  myUserId,
  lang,
}: {
  conversationId: string;
  myUserId: string | null;
  lang: Lang;
}) {
  const u = UI[lang];
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [otherName, setOtherName] = useState("");
  const [role, setRole] = useState<"buyer" | "seller" | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const strings = UI[lang];
    setError("");
    const res = await fetch(`/api/conversations/${conversationId}`, { credentials: "same-origin" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError((d as { error?: string }).error ?? strings.loadErr);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setMessages(data.messages ?? []);
    setTitle(data.listing?.title_es ?? strings.conversation);
    setRole(data.role ?? null);
    setOtherName(data.other_name ?? "");
    setLoading(false);
  }, [conversationId, lang]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Poll for new messages
  useEffect(() => {
    if (!conversationId) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/conversations/${conversationId}`, { credentials: "same-origin" });
        if (!res.ok) return;
        const data = await res.json();
        const fresh: typeof messages = data.messages ?? [];
        if (fresh.length === 0) return;
        setMessages((prev) => {
          const lastFresh = fresh[fresh.length - 1]?.id;
          const lastPrev = prev[prev.length - 1]?.id;
          if (lastFresh !== lastPrev || fresh.length !== prev.length) return fresh;
          return prev;
        });
      } catch { /* silent */ }
    }, 5000);
    return () => clearInterval(poll);
  }, [conversationId]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? u.sendErr);
      }
      const { message } = await res.json();
      setDraft("");
      setMessages((m) => [...m, message as Msg]);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("tianguis:listing-contact"));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-[#6B7280] py-8 text-center">{u.loading}</div>;
  }

  return (
    <div className="rounded-xl border border-[#E5E0D8] bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-[#E5E0D8] bg-[#F4F0EB]">
        <h1 className="text-sm font-bold text-[#1C1917] truncate">{title}</h1>
        {otherName && (
          <p className="text-xs text-[#065F46] font-semibold mt-0.5">
            {role === "seller" ? u.buyer : u.seller}: {otherName}
          </p>
        )}
      </div>
      <div className="max-h-[50vh] overflow-y-auto px-4 py-3 space-y-2 min-h-[120px]">
        {messages.map((m) => {
          const mine = myUserId && m.sender_id === myUserId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`flex flex-col gap-0.5 max-w-[85%] ${mine ? "items-end" : "items-start"}`}>
                <div
                  className={`rounded-xl px-3 py-2 text-sm ${
                    mine ? "bg-[#1B4332] text-white" : "bg-[#F4F0EB] text-[#1C1917]"
                  }`}
                >
                  {m.body}
                </div>
                <span className={`text-[10px] tabular-nums ${mine ? "text-[#A7F3D0]" : "text-[#9CA3AF]"}`}>
                  {formatDateTimeShort(m.created_at, lang)}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      {error && <div className="px-4 text-xs text-red-600">{error}</div>}
      <div className="p-3 border-t border-[#E5E0D8] flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), void send())}
          placeholder={u.placeholder}
          disabled={sending}
          className="flex-1 rounded-xl border border-[#E5E0D8] px-3 py-2 text-sm outline-none focus:border-[#1B4332]"
        />
        <button
          type="button"
          disabled={sending || !draft.trim()}
          onClick={() => void send()}
          className="px-4 py-2 rounded-xl bg-[#1B4332] text-white text-sm font-semibold disabled:opacity-40"
        >
          {sending ? "…" : u.send}
        </button>
      </div>
    </div>
  );
}
