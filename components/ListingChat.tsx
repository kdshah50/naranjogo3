"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type Msg = { id: string; sender_id: string; body: string; created_at: string };

type Thread = {
  conversationId: string;
  buyer_id: string;
  buyer_name: string;
  last_body: string;
  last_at: string;
};

export default function ListingChat({
  listingId,
  initialConversationId,
}: {
  listingId: string;
  initialConversationId?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [role, setRole] = useState<"buyer" | "seller" | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  /** Which listing `selectedId` belongs to. If it differs from `listingId`, do not use `selectedId` for sends. */
  const conversationListingIdRef = useRef<string | null>(null);
  /** Only full reset (loading + clear threads) when `listingId` actually changes, not on React remount. Stops seller flicker. */
  const lastScopeListingIdRef = useRef<string | null>(null);

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: "smooth" });

  const loadListingScope = useCallback(async () => {
    setError("");
    const listingChanged = lastScopeListingIdRef.current !== listingId;
    if (listingChanged) {
      lastScopeListingIdRef.current = listingId;
      // Avoid stale thread/messages from another anuncio (SPA navigation) or a buyer id from another listing
      setLoading(true);
      setSelectedId(null);
      setMessages([]);
      setThreads([]);
      conversationListingIdRef.current = null;
    }

    const res = await fetch(`/api/conversations?listingId=${encodeURIComponent(listingId)}`, {
      credentials: "same-origin",
    });
    if (res.status === 401) {
      setRole(null);
      setLoading(false);
      return;
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError((d as { error?: string }).error ?? "No se pudo cargar el chat");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setRole(data.role);
    if (data.role === "seller") {
      setThreads(data.threads ?? []);
    } else {
      if (data.conversation?.id) {
        setSelectedId(data.conversation.id);
        setMessages(data.messages ?? []);
        conversationListingIdRef.current = listingId;
      }
    }
    setLoading(false);
  }, [listingId]);

  const loadConversation = useCallback(
    async (conversationId: string) => {
      setSelectedId(conversationId);
      setError("");
      try {
        const res = await fetch(`/api/conversations/${conversationId}`, { credentials: "same-origin" });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setError((d as { error?: string }).error ?? "No se pudo cargar");
          setSelectedId(null);
          conversationListingIdRef.current = null;
          return;
        }
        const data = await res.json();
        setMessages(data.messages ?? []);
        const conv = data.conversation as { listing_id?: string } | undefined;
        if (conv?.listing_id === listingId) {
          conversationListingIdRef.current = listingId;
        } else {
          conversationListingIdRef.current = null;
        }
      } catch {
        setError("Error de conexión");
        setSelectedId(null);
        conversationListingIdRef.current = null;
      }
    },
    [listingId]
  );

  useEffect(() => {
    void (async () => {
      const me = await fetch("/api/auth/me", { credentials: "same-origin" });
      if (me.ok) {
        const j = await me.json();
        setMyUserId(j.user?.id ?? null);
      }
      await loadListingScope();
    })();
  }, [listingId, loadListingScope]);

  useEffect(() => {
    if (!initialConversationId) return;
    void loadConversation(initialConversationId);
  }, [initialConversationId, loadConversation]);

  // Sellers otherwise see an empty message pane until they click a buyer; they may think no message arrived.
  useEffect(() => {
    if (role !== "seller" || threads.length === 0) return;
    if (selectedId) return;
    if (initialConversationId) return;
    void loadConversation(threads[0].conversationId);
  }, [role, threads, selectedId, initialConversationId, loadConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Poll selected conversation for new messages
  useEffect(() => {
    if (!selectedId) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/conversations/${selectedId}`, { credentials: "same-origin" });
        if (!res.ok) return;
        const data = await res.json();
        const fresh: Msg[] = data.messages ?? [];
        if (fresh.length === 0) return;
        setMessages((prev) => (fresh.length > prev.length ? fresh : prev));
      } catch { /* silent */ }
    }, 5000);
    return () => clearInterval(poll);
  }, [selectedId]);

  // Poll thread list for new buyers/messages (seller only)
  useEffect(() => {
    if (role !== "seller") return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/conversations?listingId=${encodeURIComponent(listingId)}`, { credentials: "same-origin" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.role === "seller" && Array.isArray(data.threads)) {
          setThreads(data.threads);
        }
      } catch { /* silent */ }
    }, 4000);
    return () => clearInterval(poll);
  }, [role, listingId]);

  /** Always resolves the thread for this `listingId` (idempotent). Do not short-circuit on selectedId — it may belong to another anuncio. */
  const ensureConversation = async (): Promise<string | null> => {
    const res = await fetch("/api/conversations", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error((d as { error?: string }).error ?? "No se pudo iniciar el chat");
    }
    const { conversationId } = await res.json();
    return conversationId as string;
  };

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      let cid: string | null = role === "buyer" ? null : selectedId;
      if (role === "buyer") {
        if (conversationListingIdRef.current === listingId && selectedId) {
          cid = selectedId;
        } else {
          cid = await ensureConversation();
          if (!cid) throw new Error("Sin conversación");
          conversationListingIdRef.current = listingId;
          setSelectedId(cid);
        }
      }
      if (!cid) throw new Error("Selecciona una conversación");
      const res = await fetch(`/api/conversations/${cid}/messages`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? "No se pudo enviar");
      }
      const { message } = await res.json();
      setDraft("");
      setMessages((m) => [...m, message as Msg]);
      if (typeof window !== "undefined" && role !== "seller") {
        window.dispatchEvent(new CustomEvent("tianguis:listing-contact"));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div
        id="listing-inapp-chat"
        className="rounded-xl border border-[#E5E0D8] bg-white p-4 text-center text-sm text-[#6B7280]"
      >
        Cargando mensajes…
      </div>
    );
  }

  if (!role) {
    return (
      <div id="listing-inapp-chat" className="rounded-xl border border-[#E5E0D8] bg-[#F4F0EB] p-4 text-center">
        <p className="text-sm text-[#374151] mb-3">Inicia sesión para escribir al vendedor dentro de la app.</p>
        <Link
          href={`/auth/login?returnTo=${encodeURIComponent(`/listing/${listingId}`)}`}
          className="inline-block px-4 py-2 rounded-xl bg-[#1B4332] text-white text-sm font-semibold"
        >
          Entrar
        </Link>
      </div>
    );
  }

  return (
    <div id="listing-inapp-chat" className="rounded-xl border border-[#E5E0D8] bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-[#E5E0D8] bg-[#F4F0EB]">
        <h3 className="text-sm font-bold text-[#1C1917]">Mensajes en la app</h3>
        <p className="text-xs text-[#6B7280] mt-0.5">El vendedor verá tus mensajes aquí y en “Mensajes”.</p>
      </div>

      {role === "seller" && threads.length > 0 && (
        <div className="border-b border-[#E5E0D8]">
          <p className="px-4 pt-2 pb-1 text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
            Compradores ({threads.length})
          </p>
          <div className="max-h-36 overflow-y-auto divide-y divide-[#E5E0D8]">
            {threads.map((t) => {
              const isActive = selectedId === t.conversationId;
              return (
                <button
                  key={t.conversationId}
                  type="button"
                  onClick={() => void loadConversation(t.conversationId)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-3 ${
                    isActive ? "bg-[#ECFDF5] border-l-4 border-[#059669]" : "hover:bg-[#F4F0EB] border-l-4 border-transparent"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    isActive ? "bg-[#059669] text-white" : "bg-[#F4F0EB] text-[#1B4332]"
                  }`}>
                    {(t.buyer_name?.[0] ?? "C").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`font-semibold ${isActive ? "text-[#065F46]" : "text-[#1C1917]"}`}>
                      {t.buyer_name}
                    </span>
                    <span className="block text-xs text-[#6B7280] truncate">{t.last_body || "Sin mensajes aún"}</span>
                  </div>
                  {isActive && <span className="text-[#059669] text-xs">●</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {role === "seller" && threads.length === 0 && (
        <p className="px-4 py-3 text-sm text-[#6B7280]">Aún no hay mensajes de compradores en este anuncio.</p>
      )}

      {/* Active chat header — shows who you're talking to */}
      {role === "seller" && selectedId && (() => {
        const active = threads.find((t) => t.conversationId === selectedId);
        return active ? (
          <div className="px-4 py-2 bg-[#ECFDF5] border-b border-[#A7F3D0] flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#1B4332] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {(active.buyer_name?.[0] ?? "C").toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[#065F46]">Chateando con: {active.buyer_name}</p>
            </div>
            <span className="text-[10px] text-[#059669] font-semibold px-2 py-0.5 rounded-full bg-[#D1FAE5]">Activo</span>
          </div>
        ) : null;
      })()}

      <div className="max-h-64 overflow-y-auto px-4 py-3 space-y-2">
        {messages.map((m) => {
          const mine = myUserId && m.sender_id === myUserId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  mine ? "bg-[#1B4332] text-white" : "bg-[#F4F0EB] text-[#1C1917]"
                }`}
              >
                {m.body}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && <div className="px-4 pb-2 text-xs text-red-600">{error}</div>}

      <div className="p-3 border-t border-[#E5E0D8] flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), void sendMessage())}
          placeholder={role === "seller" && !selectedId ? "Elige un comprador arriba…" : "Escribe un mensaje…"}
          disabled={(role === "seller" && !selectedId) || sending}
          className="flex-1 rounded-xl border border-[#E5E0D8] px-3 py-2 text-sm outline-none focus:border-[#1B4332]"
        />
        <button
          type="button"
          disabled={(role === "seller" && !selectedId) || sending || !draft.trim()}
          onClick={() => void sendMessage()}
          className="px-4 py-2 rounded-xl bg-[#1B4332] text-white text-sm font-semibold disabled:opacity-40"
        >
          {sending ? "…" : "Enviar"}
        </button>
      </div>

      <div className="px-3 pb-3 text-center">
        <Link href="/messages" className="text-xs text-[#1B4332] font-semibold hover:underline">
          Ver todos los mensajes
        </Link>
      </div>
    </div>
  );
}
