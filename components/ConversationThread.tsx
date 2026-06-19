"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n-lang";
import { formatDateTimeShort, conversationDayKey, formatConversationDayLabel } from "@/lib/locale-format";
import {
  hasServiceMenu,
  type ServiceMenu,
} from "@/lib/listing-service-menu";
import ServiceMenuQuoteBuilder from "@/components/ServiceMenuQuoteBuilder";
import { applyChatPollUpdate, type ChatPollMessage } from "@/lib/listing-chat-poll";

type Msg = ChatPollMessage;
type ConvRole = "buyer" | "seller" | null;

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
    agreedTitle: "Precio acordado del trabajo (este comprador)",
    agreedHelp:
      "Opcional: total del trabajo en MXN. Si no lo pones, se usa el precio del anuncio o paquete. El comprador paga la tarifa de Naranjogo sobre este monto, o el servicio completo si activaste cobros con Stripe.",
    agreedPh: "ej. 850",
    agreedSave: "Guardar",
    agreedClear: "Quitar",
    agreedSaved: "Guardado",
    agreedLoading: "Cargando precio acordado…",
    invalidAmount: "Monto inválido (mín. $1 MXN).",
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
    agreedTitle: "Agreed job total (this buyer)",
    agreedHelp:
      "Optional: total for this job in MXN. If empty, the listing or package price is used. Buyer pays the Naranjogo fee on this amount, or the full service in-app if you enabled Stripe payouts.",
    agreedPh: "e.g. 850",
    agreedSave: "Save",
    agreedClear: "Clear",
    agreedSaved: "Saved",
    agreedLoading: "Loading agreed total…",
    invalidAmount: "Enter a valid amount (at least $1 MXN).",
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
  const [ticketCode, setTicketCode] = useState<string | null>(null);
  const [role, setRole] = useState<ConvRole>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  /** Listing context (loaded once via /api/conversations/:id) — for the seller quote builder. */
  const [listingId, setListingId] = useState<string | null>(null);
  const [buyerId, setBuyerId] = useState<string | null>(null);
  const [serviceMenu, setServiceMenu] = useState<ServiceMenu | null>(null);
  /** Seller agreed price (pesos string) — same semantics as ListingChat. */
  const [agreedPesos, setAgreedPesos] = useState("");
  const [agreedLoading, setAgreedLoading] = useState(false);
  const [agreedSaving, setAgreedSaving] = useState(false);
  const [agreedErr, setAgreedErr] = useState("");
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const strings = UI[lang];
    setError("");
    const res = await fetch(`/api/conversations/${conversationId}`, {
      credentials: "same-origin",
      cache: "no-store",
    });
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
    setTicketCode((data.ticket_code as string | null | undefined) ?? null);
    const listingFromApi = data.listing as
      | { id?: string; service_menu?: ServiceMenu | null; category_id?: string | null }
      | undefined;
    const isServices =
      String(listingFromApi?.category_id ?? "").trim().toLowerCase() === "services";
    setListingId(listingFromApi?.id ? String(listingFromApi.id) : null);
    setServiceMenu(isServices ? (listingFromApi?.service_menu ?? null) : null);
    const convFromApi = data.conversation as { buyer_id?: string } | undefined;
    setBuyerId(convFromApi?.buyer_id ? String(convFromApi.buyer_id) : null);
    setLoading(false);
  }, [conversationId, lang]);

  useEffect(() => {
    void load();
  }, [load]);

  const scrollMessagesToBottom = () => {
    const el = messagesScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    });
  };

  useEffect(() => {
    scrollMessagesToBottom();
  }, [messages]);

  // Poll for new messages (provider may miss buyer-side browser events).
  useEffect(() => {
    if (!conversationId) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/conversations/${conversationId}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        const fresh: Msg[] = data.messages ?? [];
        setMessages((prev) => applyChatPollUpdate(prev, fresh));
      } catch {
        /* silent */
      }
    }, 4000);
    return () => clearInterval(poll);
  }, [conversationId]);

  useEffect(() => {
    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", refreshOnVisible);
    return () => document.removeEventListener("visibilitychange", refreshOnVisible);
  }, [load]);

  // Seller: load existing agreed price for this listing+buyer pair.
  useEffect(() => {
    if (role !== "seller" || !listingId || !buyerId) {
      setAgreedPesos("");
      setAgreedErr("");
      setAgreedLoading(false);
      return;
    }
    let cancelled = false;
    setAgreedLoading(true);
    setAgreedErr("");
    void (async () => {
      try {
        const r = await fetch(
          `/api/listings/${encodeURIComponent(listingId)}/service-booking/agreed-price?buyerId=${encodeURIComponent(buyerId)}`,
          { credentials: "same-origin" }
        );
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (!cancelled) {
            setAgreedErr((d as { error?: string }).error ?? "No se pudo cargar precio acordado");
          }
          return;
        }
        const cents = (d as { agreedSubtotalMxnCents?: number | null }).agreedSubtotalMxnCents;
        if (!cancelled) {
          setAgreedPesos(
            cents != null && Number.isFinite(Number(cents)) ? String(Number(cents) / 100) : "",
          );
        }
      } catch {
        if (!cancelled) setAgreedErr("Error de red");
      } finally {
        if (!cancelled) setAgreedLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role, listingId, buyerId]);

  const postBody = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? u.sendErr);
      }
      const { message } = await res.json();
      setMessages((m) => [...m, message as Msg]);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("tianguis:listing-contact"));
      }
    } finally {
      setSending(false);
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    try {
      await postBody(text);
      setDraft("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    }
  };

  const saveAgreedPrice = async (clear: boolean) => {
    if (role !== "seller" || !listingId || !buyerId) return;
    setAgreedSaving(true);
    setAgreedErr("");
    try {
      const pesos = parseFloat(String(agreedPesos).trim().replace(/,/g, "."));
      const cents = Math.round(pesos * 100);
      if (!clear) {
        if (!Number.isFinite(pesos) || cents < 100) {
          throw new Error(u.invalidAmount);
        }
      }
      const body = clear
        ? { buyerId, agreedSubtotalMxnCents: null as number | null }
        : { buyerId, agreedSubtotalMxnCents: cents };
      const r = await fetch(
        `/api/listings/${encodeURIComponent(listingId)}/service-booking/agreed-price`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "No se pudo guardar");
      if (clear) setAgreedPesos("");
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("tianguis:agreed-price-updated", { detail: { listingId } }),
        );
      }
    } catch (e: unknown) {
      setAgreedErr(e instanceof Error ? e.message : "Error");
    } finally {
      setAgreedSaving(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-[#6B7280] py-8 text-center">{u.loading}</div>;
  }

  const showQuoteSection = role === "seller" && listingId && buyerId;
  const showQuoteBuilder = showQuoteSection && hasServiceMenu(serviceMenu);

  return (
    <div className="rounded-xl border border-[#E5E0D8] bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-[#E5E0D8] bg-[#F4F0EB]">
        <h1 className="text-sm font-bold text-[#1C1917] truncate">
          {ticketCode ? `${ticketCode} · ` : ""}
          {title}
        </h1>
        {otherName && (
          <p className="text-xs text-[#065F46] font-semibold mt-0.5">
            {role === "seller" ? u.buyer : u.seller}: {otherName}
          </p>
        )}
      </div>

      {showQuoteSection && (
        <div className="px-4 py-3 border-b border-[#E5E0D8] bg-[#FFFBEB] text-xs space-y-2">
          <p className="font-semibold text-[#78350F]">{u.agreedTitle}</p>
          <p className="text-[#92400E] leading-snug">{u.agreedHelp}</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1 min-w-[120px]">
              <span className="sr-only">MXN</span>
              <input
                type="text"
                inputMode="decimal"
                value={agreedPesos}
                onChange={(e) => setAgreedPesos(e.target.value)}
                disabled={agreedSaving}
                placeholder={u.agreedPh}
                className="w-full rounded-lg border border-amber-200 px-2 py-1.5 text-sm text-[#1C1917] outline-none focus:border-[#B45309]"
              />
            </label>
            <button
              type="button"
              disabled={agreedLoading || agreedSaving}
              onClick={() => void saveAgreedPrice(false)}
              className="px-3 py-1.5 rounded-lg bg-[#B45309] text-white text-[11px] font-semibold disabled:opacity-40"
            >
              {agreedSaving ? "…" : u.agreedSave}
            </button>
            <button
              type="button"
              disabled={agreedLoading || agreedSaving}
              onClick={() => void saveAgreedPrice(true)}
              className="px-3 py-1.5 rounded-lg border border-amber-300 text-[#78350F] text-[11px] font-semibold disabled:opacity-40"
            >
              {u.agreedClear}
            </button>
          </div>
          {agreedLoading && (
            <p className="text-[#A16207]">{u.agreedLoading}</p>
          )}
          {agreedErr && <p className="text-red-600">{agreedErr}</p>}
          {showQuoteBuilder && (
            <ServiceMenuQuoteBuilder
              menu={serviceMenu}
              lang={lang === "en" ? "en" : "es"}
              disabled={agreedSaving || agreedLoading}
              onApplyTotal={(pesos) => setAgreedPesos(pesos)}
              onInsertAsMessage={async (body) => {
                try {
                  await postBody(body);
                } catch (e: unknown) {
                  setAgreedErr(e instanceof Error ? e.message : "Error");
                }
              }}
            />
          )}
        </div>
      )}

      <div
        ref={messagesScrollRef}
        className="max-h-[50vh] overflow-y-auto overflow-x-hidden px-4 py-3 space-y-2 min-h-[120px] overscroll-y-contain"
      >
        {messages.map((m, idx) => {
          const mine = myUserId && m.sender_id.trim().toLowerCase() === myUserId.trim().toLowerCase();
          const isSystem = m.body.startsWith("[Naranjogo]");
          const dayKey = conversationDayKey(m.created_at);
          const prevDayKey = idx > 0 ? conversationDayKey(messages[idx - 1].created_at) : null;
          const showDay = dayKey !== prevDayKey;
          return (
            <div key={m.id} className="space-y-2">
              {showDay ? (
                <p className="text-center text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wide py-1">
                  {formatConversationDayLabel(m.created_at, lang)}
                </p>
              ) : null}
              <div className={`flex ${isSystem ? "justify-center" : mine ? "justify-end" : "justify-start"}`}>
                <div className={`flex flex-col gap-0.5 max-w-[85%] ${mine ? "items-end" : "items-start"}`}>
                  <div
                    className={`rounded-xl px-3 py-2 text-sm ${
                      isSystem
                        ? "bg-amber-50 border border-amber-200 text-amber-950 text-xs leading-relaxed"
                        : mine
                          ? "bg-[#1B4332] text-white"
                          : "bg-[#F4F0EB] text-[#1C1917]"
                    }`}
                  >
                    {m.body}
                  </div>
                  {!isSystem ? (
                    <span className="text-[10px] tabular-nums text-[#9CA3AF]">
                      {formatDateTimeShort(m.created_at, lang)}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
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
