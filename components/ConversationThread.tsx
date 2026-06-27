"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n-lang";
import { formatDateTimeShort, conversationDayKey, formatConversationDayLabel } from "@/lib/locale-format";
import {
  hasServiceMenu,
  type ServiceMenu,
} from "@/lib/listing-service-menu";
import ServiceMenuQuoteBuilder, { type QuoteBuilderPayload } from "@/components/ServiceMenuQuoteBuilder";
import ServiceQuoteBuyerPanel from "@/components/ServiceQuoteBuyerPanel";
import {
  buyerFacingQuoteStatus,
  type ServiceQuoteLineItem,
  type ServiceQuoteMetadata,
  type ServiceQuoteStatus,
} from "@/lib/service-quote";
import type { ServiceQuoteLayout } from "@/lib/service-quote-vertical";
import Link from "next/link";
import { withLang } from "@/lib/i18n-lang";
import {
  applyChatPollUpdate,
  appendChatMessageDeduped,
  type ChatPollMessage,
} from "@/lib/listing-chat-poll";
import { redactPiiInChatDisplay } from "@/lib/pii-display";

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
    payOnListing: "Ir al anuncio para pagar depósito",
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
    payOnListing: "Go to listing to pay deposit",
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
  const [requiresQuoteAccept, setRequiresQuoteAccept] = useState(false);
  const [quoteLayout, setQuoteLayout] = useState<ServiceQuoteLayout>("default");
  const [quoteStatus, setQuoteStatus] = useState<ServiceQuoteStatus>("none");
  const [quoteAgreedCents, setQuoteAgreedCents] = useState<number | null>(null);
  const [quoteSentAt, setQuoteSentAt] = useState<string | null>(null);
  const [quoteLineItems, setQuoteLineItems] = useState<ServiceQuoteLineItem[] | null>(null);
  const [quoteMetadata, setQuoteMetadata] = useState<ServiceQuoteMetadata | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const initialMessagesLoadedRef = useRef(false);
  const [myAccountPool, setMyAccountPool] = useState<string[]>([]);

  const syncMessages = useCallback(async () => {
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
  }, [conversationId]);

  const loadQuoteState = useCallback(async () => {
    if (!listingId) return;
    const buyerQuery =
      role === "seller" && buyerId ? `?buyerId=${encodeURIComponent(buyerId)}` : "";
    try {
      const r = await fetch(
        `/api/listings/${encodeURIComponent(listingId)}/service-booking/quote${buyerQuery}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return;
      setRequiresQuoteAccept(Boolean((d as { requiresQuoteAccept?: boolean }).requiresQuoteAccept));
      const layout = (d as { quoteLayout?: ServiceQuoteLayout }).quoteLayout;
      if (layout === "housekeeping" || layout === "default") setQuoteLayout(layout);
      setQuoteStatus(
        buyerFacingQuoteStatus(
          (d as { quoteStatus?: ServiceQuoteStatus }).quoteStatus ?? "none",
          (d as { quoteSentAt?: string | null }).quoteSentAt ?? null,
        ),
      );
      const cents = (d as { agreedSubtotalMxnCents?: number | null }).agreedSubtotalMxnCents;
      setQuoteAgreedCents(cents != null ? Number(cents) : null);
      setQuoteSentAt((d as { quoteSentAt?: string | null }).quoteSentAt ?? null);
      const items = (d as { quoteLineItems?: ServiceQuoteLineItem[] | null }).quoteLineItems;
      setQuoteLineItems(Array.isArray(items) && items.length > 0 ? items : null);
      setQuoteMetadata((d as { quoteMetadata?: ServiceQuoteMetadata | null }).quoteMetadata ?? null);
    } catch {
      /* silent */
    }
  }, [listingId, role, buyerId]);

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
    const fresh: Msg[] = data.messages ?? [];
    setMessages((prev) =>
      initialMessagesLoadedRef.current ? applyChatPollUpdate(prev, fresh) : fresh,
    );
    initialMessagesLoadedRef.current = true;
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
    initialMessagesLoadedRef.current = false;
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      const me = await fetch("/api/auth/me", { credentials: "same-origin" });
      if (!me.ok) return;
      const j = await me.json();
      const pool = (j as { accountPool?: string[] }).accountPool;
      if (Array.isArray(pool) && pool.length > 0) {
        setMyAccountPool(pool.map((id) => String(id).trim().toLowerCase()));
      }
    })();
  }, []);

  useEffect(() => {
    void loadQuoteState();
  }, [loadQuoteState]);

  useEffect(() => {
    if (!listingId) return;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadQuoteState();
    }, 2000);
    return () => clearInterval(t);
  }, [listingId, loadQuoteState]);

  useEffect(() => {
    const onQuote = (ev: Event) => {
      const d = (ev as CustomEvent<{ listingId?: string }>).detail;
      if (d?.listingId && listingId && d.listingId !== listingId) return;
      void loadQuoteState();
      void syncMessages();
    };
    window.addEventListener("tianguis:quote-updated", onQuote);
    return () => window.removeEventListener("tianguis:quote-updated", onQuote);
  }, [listingId, loadQuoteState, syncMessages]);

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
    const poll = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void syncMessages();
    }, 2000);
    return () => clearInterval(poll);
  }, [conversationId, syncMessages]);

  useEffect(() => {
    const onContact = () => {
      if (document.visibilityState === "visible") void syncMessages();
    };
    window.addEventListener("tianguis:listing-contact", onContact);
    return () => window.removeEventListener("tianguis:listing-contact", onContact);
  }, [syncMessages]);

  useEffect(() => {
    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") void syncMessages();
    };
    document.addEventListener("visibilitychange", refreshOnVisible);
    return () => document.removeEventListener("visibilitychange", refreshOnVisible);
  }, [syncMessages]);

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
      const msg = message as Msg;
      setMessages((m) => appendChatMessageDeduped(m, msg));
      window.setTimeout(() => void syncMessages(), 400);
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

  const sendOfficialQuote = async (payload: QuoteBuilderPayload) => {
    if (role !== "seller" || !listingId || !buyerId) return;
    setAgreedErr("");
    const r = await fetch(`/api/listings/${encodeURIComponent(listingId)}/service-booking/quote/send`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyerId,
        agreedSubtotalMxnCents: payload.totalCents,
        quoteLineItems: payload.lineItems,
        quoteMetadata: {
          visitFrequency: payload.visitFrequency,
          quoteBasis: payload.quoteBasis,
          lang: lang === "en" ? "en" : "es",
          kind: "provider_quote",
        },
        messageBody: payload.messageBody,
        lang: lang === "en" ? "en" : "es",
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw new Error((d as { error?: string; message?: string }).message ?? (d as { error?: string }).error ?? u.sendErr);
    }
    const msg = (d as { message?: Msg }).message;
    if (msg) setMessages((m) => appendChatMessageDeduped(m, msg));
    window.setTimeout(() => void syncMessages(), 400);
    window.dispatchEvent(new CustomEvent("tianguis:quote-updated", { detail: { listingId } }));
    await loadQuoteState();
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
  const buyerQuoteStatus = buyerFacingQuoteStatus(quoteStatus, quoteSentAt);
  const showBuyerQuotePanel =
    role === "buyer" &&
    requiresQuoteAccept &&
    (buyerQuoteStatus === "pending" || buyerQuoteStatus === "accepted");
  const listingHref = listingId
    ? withLang(`/listing/${listingId}${quoteStatus === "pending" ? "?quote=1" : ""}`, lang)
    : null;

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

      {showBuyerQuotePanel && listingId ? (
        <div className="px-4 py-3 border-b border-[#E5E0D8]">
          <ServiceQuoteBuyerPanel
            listingId={listingId}
            quoteStatus={buyerQuoteStatus}
            agreedSubtotalMxnCents={quoteAgreedCents}
            quoteSentAt={quoteSentAt}
            lang={lang === "en" ? "en" : "es"}
            onResponded={() => void loadQuoteState()}
          />
          {buyerQuoteStatus === "accepted" && listingHref ? (
            <Link
              href={listingHref}
              className="mt-2 block text-center text-xs font-semibold text-[#1B4332] hover:underline"
            >
              {u.payOnListing}
            </Link>
          ) : null}
        </div>
      ) : null}

      {showQuoteSection && requiresQuoteAccept && showQuoteBuilder ? (
        <div className="px-4 py-3 border-b border-[#E5E0D8] bg-[#FFFBEB] text-xs space-y-2">
          {agreedErr ? <p className="text-red-600">{agreedErr}</p> : null}
          <ServiceMenuQuoteBuilder
            menu={serviceMenu}
            lang={lang === "en" ? "en" : "es"}
            quoteLayout={quoteLayout}
            requiresBuyerContact
            variant="seller"
            disabled={agreedSaving || agreedLoading}
            initialCartLines={quoteLineItems?.map((x) => ({ sku: x.sku, qty: x.qty }))}
            initialVisitFrequency={quoteMetadata?.visitFrequency}
            initialQuoteBasis={quoteMetadata?.quoteBasis}
            onSendOfficialQuote={sendOfficialQuote}
          />
        </div>
      ) : null}

      {showQuoteSection && !requiresQuoteAccept ? (
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
          {agreedLoading ? <p className="text-[#A16207]">{u.agreedLoading}</p> : null}
          {agreedErr ? <p className="text-red-600">{agreedErr}</p> : null}
          {showQuoteBuilder ? (
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
          ) : null}
        </div>
      ) : null}

      <div
        ref={messagesScrollRef}
        className="max-h-[50vh] overflow-y-auto overflow-x-hidden px-4 py-3 space-y-2 min-h-[120px] overscroll-y-contain"
      >
        {messages.map((m, idx) => {
          const senderNorm = String(m.sender_id).trim().toLowerCase();
          const mine =
            (myUserId && senderNorm === myUserId.trim().toLowerCase()) ||
            (myAccountPool.length > 0 && myAccountPool.includes(senderNorm));
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
                    {isSystem ? m.body : redactPiiInChatDisplay(m.body, lang === "en" ? "en" : "es")}
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
